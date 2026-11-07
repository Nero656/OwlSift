import type { LocalProvider } from './localProviders';
export interface ModelRequest { provider: LocalProvider; endpoint: string; apiKey?: string; operation: 'models' | 'chat'; model?: string; messages?: Array<{ role: string; content: string }>; stream?: boolean }
export class ProviderError extends Error { constructor(public code: string, message: string, public status = 0) { super(message); this.name = 'ProviderError'; } }
export function modelBase(provider: LocalProvider, endpoint: string, operation: ModelRequest['operation']) {
    let base: URL;
    try { base = new URL(endpoint.trim()); } catch { throw new ProviderError('address', 'Enter a full server URL, for example http://192.168.1.20:11434.'); }
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new ProviderError('address', 'Use an HTTP(S) server URL without embedded credentials, query parameters, or fragments.');
    let path = base.pathname.replace(/\/+$/, '');
    if (provider === 'ollama' && operation === 'models') path = path.replace(/\/v1$/, '') + '/api/tags';
    else path = (path.endsWith('/v1') ? path : path + '/v1') + (operation === 'models' ? '/models' : '/chat/completions');
    base.pathname = path; return base.toString();
}
export function parseModelList(provider: LocalProvider | 'global', payload: unknown): string[] {
    const key = provider === 'ollama' ? 'models' : 'data';
    if (!payload || typeof payload !== 'object' || !Array.isArray((payload as Record<string, unknown>)[key])) throw new ProviderError('response', 'Invalid model list. Check the selected provider, API base URL and port.');
    const entries = (payload as Record<string, unknown[]>)[key]!;
    const names = entries.map((item: any) => item && typeof item === 'object' ? provider === 'ollama' ? item.name ?? item.model : item.id : undefined);
    if (names.some(name => typeof name !== 'string' || !name.trim())) throw new ProviderError('response', 'Invalid model entries. Check the server API compatibility.');
    return [...new Set(names.map(name => (name as string).trim()))];
}
export function safeProviderError(error: unknown, request: Pick<ModelRequest, 'endpoint' | 'apiKey'>): ProviderError {
    if (error instanceof ProviderError) return error;
    const name = error instanceof Error ? error.name : '';
    if (name === 'AbortError') return new ProviderError('cancelled', 'Request cancelled.');
    if (name === 'TimeoutError') return new ProviderError('timeout', 'Server timed out. Check its address, port, LAN connection and model loading.');
    let host = 'the configured server';
    try { host = new URL(request.endpoint).host; } catch { /* validated separately */ }
    return new ProviderError('network', 'Cannot reach ' + host + '. Check IP/port, enable LAN listening, and allow the port in the server firewall. Browser access may also be blocked by CORS or HTTPS mixed-content restrictions.');
}
export async function fetchModel(request: ModelRequest, signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<Response> {
    if (!['ollama', 'lmstudio'].includes(request.provider) || !['models', 'chat'].includes(request.operation)) throw new ProviderError('address', 'Unknown provider or operation.');
    const url = modelBase(request.provider, request.endpoint, request.operation);
    const headers: Record<string, string> = { Accept: request.operation === 'models' ? 'application/json' : 'text/event-stream, application/json' };
    const token = request.apiKey?.trim().replace(/^Bearer\s+/i, '');
    if (token) headers.Authorization = 'Bearer ' + token;
    if (request.operation === 'chat') headers['Content-Type'] = 'application/json';
    try {
        const timeout = AbortSignal.timeout(request.operation === 'models' ? 10000 : 180000);
        const response = await fetcher(url, { method: request.operation === 'models' ? 'GET' : 'POST', headers, signal: signal ? AbortSignal.any([signal, timeout]) : timeout, redirect: 'error', cache: 'no-store', ...(request.operation === 'chat' ? { body: JSON.stringify({ model: request.model, messages: request.messages ?? [], stream: request.stream !== false }) } : {}) });
        if (!response.ok) {
            await response.body?.cancel();
            if (response.status === 401 || response.status === 403) throw new ProviderError('auth', 'Authentication failed. Set a valid server API token and check its model/chat permissions.', response.status);
            throw new ProviderError('http', 'Server returned HTTP ' + response.status + '. Check provider, API base URL, model name and server logs.', response.status);
        }
        const type = response.headers.get('content-type') ?? '';
        if (!type.includes('application/json') && !(request.operation === 'chat' && type.includes('text/event-stream'))) { await response.body?.cancel(); throw new ProviderError('response', 'Expected JSON or a chat stream. Check the server API URL and port.'); }
        return response;
    } catch (error) { throw safeProviderError(error, request); }
}
export async function discoverModels(request: Omit<ModelRequest, 'operation'>, signal?: AbortSignal, fetcher: typeof fetch = fetch) {
    const response = await fetchModel({ ...request, operation: 'models' }, signal, fetcher);
    try { return parseModelList(request.provider, await response.json()); }
    catch (error) { if (error instanceof ProviderError) throw error; throw new ProviderError('response', 'Malformed JSON in model list. Check server API and URL.'); }
}
