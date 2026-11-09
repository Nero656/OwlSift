"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_worker_threads_1 = require("node:worker_threads");
const indexedText_1 = require("./indexedText");
node_worker_threads_1.parentPort?.on('message', async (request) => {
    const { id, filePath, extension } = request;
    try {
        node_worker_threads_1.parentPort.postMessage({ id, text: await (0, indexedText_1.readIndexedText)(filePath, extension) });
    }
    catch (cause) {
        const error = cause;
        node_worker_threads_1.parentPort.postMessage({ id, message: error.message, code: error.code });
    }
});
