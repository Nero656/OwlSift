"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRichDocument = void 0;
exports.canIndexText = canIndexText;
exports.readIndexedText = readIndexedText;
exports.createScanTextReader = createScanTextReader;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_worker_threads_1 = require("node:worker_threads");
const fflate_1 = require("fflate");
const fileTypeGroups_1 = require("../utils/fileTypeGroups");
const MAX_DOCUMENT_BYTES = 16 * 1024 * 1024;
const MAX_DOCUMENT_TEXT = 120_000;
const isRichDocument = (extension) => ['pdf', 'docx', 'odt'].includes(extension);
exports.isRichDocument = isRichDocument;
function canIndexText(extension, size) {
    if ((0, exports.isRichDocument)(extension))
        return size <= MAX_DOCUMENT_BYTES;
    return fileTypeGroups_1.searchableTextExtensions.has(extension) && size <= 2 * 1024 * 1024;
}
function decodeXml(value) {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, key) => {
        if (!key.startsWith('#'))
            return named[key] ?? entity;
        const hex = key[1]?.toLowerCase() === 'x';
        const code = Number.parseInt(key.slice(hex ? 2 : 1), hex ? 16 : 10);
        return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : entity;
    });
}
function officeText(bytes, extension) {
    const filename = extension === 'docx' ? 'word/document.xml' : 'content.xml';
    try {
        const xml = (0, fflate_1.unzipSync)(bytes, { filter: entry => entry.name === filename && entry.originalSize <= 10 * 1024 * 1024 })[filename];
        if (!xml)
            return '';
        const paragraphs = (0, fflate_1.strFromU8)(xml).matchAll(/<(?:[\w.-]+:)?([ph])(?=[\s>])[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?\1\s*>/g);
        let text = '';
        for (const [, , paragraph] of paragraphs) {
            text += decodeXml(paragraph
                .replace(/<(?:[\w.-]+:)?(?:s|tab|br|line-break)(?=[\s/>])[^>]*>/g, ' ')
                .replace(/<[^>]*>/g, '')) + '\n';
            if (text.length >= MAX_DOCUMENT_TEXT)
                break;
        }
        return text.slice(0, MAX_DOCUMENT_TEXT).trim();
    }
    catch {
        return '';
    }
}
async function pdfText(bytes, signal) {
    const pdf = require('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdf.getDocument({ data: bytes, verbosity: 0, disableFontFace: true, useSystemFonts: false });
    const abort = () => { void task.destroy().catch(() => { }); };
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
            await new Promise(resolve => setImmediate(resolve));
        }
        return text.slice(0, MAX_DOCUMENT_TEXT).trim();
    }
    catch (error) {
        signal?.throwIfAborted();
        if (error instanceof Error && ['InvalidPDFException', 'PasswordException', 'FormatError'].includes(error.name))
            return '';
        throw error;
    }
    finally {
        signal?.removeEventListener('abort', abort);
        await task.destroy().catch(() => { });
    }
}
async function readIndexedText(filePath, extension, signal, readFile = node_fs_1.default.promises.readFile) {
    if (!(0, exports.isRichDocument)(extension))
        return readFile(filePath, { encoding: 'utf8', signal });
    const bytes = await readFile(filePath, { signal });
    if (bytes.length > MAX_DOCUMENT_BYTES)
        return '';
    return extension === 'pdf' ? pdfText(Uint8Array.from(bytes), signal) : officeText(bytes, extension);
}
/** Keep PDF parsing and archive inflation off Electron's main thread. */
function createScanTextReader(signal) {
    let worker;
    let unavailable = false;
    let serial = 0;
    const pending = new Map();
    const workerError = new Error('Document extraction worker unavailable');
    const dispose = () => {
        signal.removeEventListener('abort', dispose);
        unavailable = true;
        for (const task of pending.values())
            task.reject(workerError);
        pending.clear();
        void worker?.terminate();
        worker = undefined;
    };
    signal.addEventListener('abort', dispose, { once: true });
    const read = async (filePath, extension, readFile = node_fs_1.default.promises.readFile) => {
        signal.throwIfAborted();
        if (!unavailable && (0, exports.isRichDocument)(extension)) {
            try {
                if (!worker) {
                    try {
                        worker = new node_worker_threads_1.Worker(node_path_1.default.join(__dirname, 'indexedTextWorker.js'));
                    }
                    catch {
                        dispose();
                        throw workerError;
                    }
                    worker.on('error', dispose);
                    worker.on('exit', dispose);
                    worker.on('message', (reply) => {
                        const task = pending.get(reply.id);
                        if (!task)
                            return;
                        pending.delete(reply.id);
                        if ('text' in reply)
                            task.resolve(reply.text);
                        else
                            task.reject(Object.assign(new Error(reply.message), { code: reply.code }));
                    });
                }
                return await new Promise((resolve, reject) => {
                    const id = ++serial;
                    pending.set(id, { resolve, reject });
                    try {
                        worker.postMessage({ id, filePath, extension });
                    }
                    catch {
                        dispose();
                    }
                });
            }
            catch (cause) {
                if (cause !== workerError)
                    throw cause;
                signal.throwIfAborted();
            }
        }
        return readIndexedText(filePath, extension, signal, readFile);
    };
    return { read, dispose };
}
