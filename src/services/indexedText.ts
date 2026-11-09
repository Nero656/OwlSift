import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { strFromU8, unzipSync } from 'fflate';
import { searchableTextExtensions } from '../utils/fileTypeGroups';

const MAX_DOCUMENT_BYTES = 16 * 1024 * 1024;
const MAX_DOCUMENT_TEXT = 120_000;
export const isRichDocument = (extension: string) => ['pdf', 'docx', 'odt'].includes(extension);

export function canIndexText(extension: string, size: number): boolean {
    if (isRichDocument(extension)) return size <= MAX_DOCUMENT_BYTES;
    return searchableTextExtensions.has(extension) && size <= 2 * 1024 * 1024;
}

function decodeXml(value: string): string {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, key: string) => {
        if (!key.startsWith('#')) return named[key] ?? entity;
        const hex = key[1]?.toLowerCase() === 'x';
        const code = Number.parseInt(key.slice(hex ? 2 : 1), hex ? 16 : 10);
        return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : entity;
    });
}

function officeText(bytes: Uint8Array, extension: string): string {
    const filename = extension === 'docx' ? 'word/document.xml' : 'content.xml';
    try {
        const xml = unzipSync(bytes, { filter: entry => entry.name === filename && entry.originalSize <= 10 * 1024 * 1024 })[filename];
        if (!xml) return '';
        const paragraphs = strFromU8(xml).matchAll(/<(?:[\w.-]+:)?([ph])(?=[\s>])[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?\1\s*>/g);
        let text = '';
        for (const [, , paragraph] of paragraphs) {
            text += decodeXml(paragraph!
                .replace(/<(?:[\w.-]+:)?(?:s|tab|br|line-break)(?=[\s/>])[^>]*>/g, ' ')
                .replace(/<[^>]*>/g, '')) + '\n';
            if (text.length >= MAX_DOCUMENT_TEXT) break;
        }
        return text.slice(0, MAX_DOCUMENT_TEXT).trim();
    } catch {
        return '';
    }
}

async function pdfText(bytes: Uint8Array, signal?: AbortSignal): Promise<string> {
    const pdf = require('pdfjs-dist/legacy/build/pdf.mjs') as typeof import('pdfjs-dist');
    const task = pdf.getDocument({ data: bytes, verbosity: 0, disableFontFace: true, useSystemFonts: false });
    const abort = () => { void task.destroy().catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true });
    try {
        const document = await task.promise;
        let text = '';
        for (let i = 1; i <= Math.min(document.numPages, 100) && text.length < MAX_DOCUMENT_TEXT; i++) {
            signal?.throwIfAborted();
            const page = await document.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(item => 'str' in item ? item.str : '').join(' ') + '\n';
            page.cleanup();
            await new Promise<void>(resolve => setImmediate(resolve));
        }
        return text.slice(0, MAX_DOCUMENT_TEXT).trim();
    } catch (error) {
        signal?.throwIfAborted();
        if (error instanceof Error && ['InvalidPDFException', 'PasswordException', 'FormatError'].includes(error.name)) return '';
        throw error;
    } finally {
        signal?.removeEventListener('abort', abort);
        await task.destroy().catch(() => {});
    }
}

export async function readIndexedText(filePath: string, extension: string, signal?: AbortSignal, readFile = fs.promises.readFile): Promise<string> {
    if (!isRichDocument(extension)) return readFile(filePath, { encoding: 'utf8', signal });
    const bytes = await readFile(filePath, { signal });
    if (bytes.length > MAX_DOCUMENT_BYTES) return '';
    return extension === 'pdf' ? pdfText(Uint8Array.from(bytes), signal) : officeText(bytes, extension);
}

type TextReply = { id: number; text: string } | { id: number; message: string; code?: string };

/** Keep PDF parsing and archive inflation off Electron's main thread. */
export function createScanTextReader(signal: AbortSignal) {
    let worker: Worker | undefined;
    let unavailable = false;
    let serial = 0;
    const pending = new Map<number, { resolve: (text: string) => void; reject: (cause: unknown) => void }>();
    const workerError = new Error('Document extraction worker unavailable');
    const dispose = () => {
        signal.removeEventListener('abort', dispose);
        unavailable = true;
        for (const task of pending.values()) task.reject(workerError);
        pending.clear();
        void worker?.terminate();
        worker = undefined;
    };
    signal.addEventListener('abort', dispose, { once: true });

    const read = async (filePath: string, extension: string, readFile = fs.promises.readFile) => {
        signal.throwIfAborted();
        if (!unavailable && isRichDocument(extension)) {
            try {
                if (!worker) {
                    try { worker = new Worker(path.join(__dirname, 'indexedTextWorker.js')); }
                    catch { dispose(); throw workerError; }
                    worker.on('error', dispose);
                    worker.on('exit', dispose);
                    worker.on('message', (reply: TextReply) => {
                        const task = pending.get(reply.id);
                        if (!task) return;
                        pending.delete(reply.id);
                        if ('text' in reply) task.resolve(reply.text);
                        else task.reject(Object.assign(new Error(reply.message), { code: reply.code }));
                    });
                }
                return await new Promise<string>((resolve, reject) => {
                    const id = ++serial;
                    pending.set(id, { resolve, reject });
                    try { worker!.postMessage({ id, filePath, extension }); }
                    catch { dispose(); }
                });
            } catch (cause) {
                if (cause !== workerError) throw cause;
                signal.throwIfAborted();
            }
        }
        return readIndexedText(filePath, extension, signal, readFile);
    };
    return { read, dispose };
}
