import { parentPort } from 'node:worker_threads';
import { readIndexedText } from './indexedText';

parentPort?.on('message', async (request: { id: number; filePath: string; extension: string }) => {
    const { id, filePath, extension } = request;
    try {
        parentPort!.postMessage({ id, text: await readIndexedText(filePath, extension) });
    } catch (cause) {
        const error = cause as NodeJS.ErrnoException;
        parentPort!.postMessage({ id, message: error.message, code: error.code });
    }
});
