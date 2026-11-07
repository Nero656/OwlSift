import type { IpcMain } from 'electron';
import { fetchModel, safeProviderError, type ModelRequest } from './modelTransport';
/** Stream in the main process so packaged apps can reach LAN servers without browser CORS. */
export function registerModelIpc(ipc: IpcMain) {
    const requests = new Map<string, AbortController>();
    ipc.handle('ai:cancel', (event, id: string) => requests.get(event.sender.id + ':' + id)?.abort());
    ipc.handle('ai:request', async (event, request: ModelRequest & { id: string }) => {
        if (!request || typeof request.id !== 'string' || request.id.length > 100 || typeof request.endpoint !== 'string' || request.endpoint.length > 2048 || JSON.stringify(request).length > 2500000) throw new Error('Invalid model request');
        const key = event.sender.id + ':' + request.id;
        if (requests.has(key)) throw new Error('Duplicate model request');
        const controller = new AbortController(); requests.set(key, controller);
        const cleanup = () => { requests.delete(key); event.sender.off('destroyed', abort); };
        const abort = () => controller.abort();
        event.sender.once('destroyed', abort);
        const send = (data: object) => { if (!event.sender.isDestroyed()) event.sender.send('ai:chunk', { id: request.id, ...data }); };
        try {
            const response = await fetchModel(request, controller.signal);
            const reader = response.body?.getReader();
            // The renderer subscribes before invoking, so early chunks cannot be lost.
            void (async () => {
                let failure: ReturnType<typeof safeProviderError> | undefined;
                try { if (reader) while (true) { const { done, value } = await reader.read(); if (done) break; send({ bytes: Array.from(value) }); } }
                catch (error) { failure = safeProviderError(error, request); }
                finally { await reader?.cancel().catch(() => {}); reader?.releaseLock(); cleanup(); }
                send(failure ? { error: { code: failure.code, message: failure.message, status: failure.status } } : { done: true });
            })();
            return { status: response.status, contentType: response.headers.get('content-type') ?? '' };
        } catch (error) { cleanup(); const e = safeProviderError(error, request); return { error: { code: e.code, message: e.message, status: e.status } }; }
    });
}
