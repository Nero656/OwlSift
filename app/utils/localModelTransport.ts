import { fetchModel, ProviderError, safeProviderError, type ModelRequest } from '../../src/services/modelTransport'
export async function localModelResponse(request: ModelRequest, signal?: AbortSignal): Promise<Response> {
  if (import.meta.client && window.electron) {
    const bridge = window.electron
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    let stream!: ReadableStreamDefaultController<Uint8Array>, finished = false
    let off: (() => void) | undefined
    const cleanup = () => { off?.(); signal?.removeEventListener('abort', abort) }
    const abort = () => {
      void bridge.invoke('ai:cancel', id).catch(() => {})
      if (!finished) { finished = true; stream.error(new DOMException('Request cancelled', 'AbortError')) }
      cleanup()
    }
    const body = new ReadableStream<Uint8Array>({ start(c) { stream = c }, cancel() { abort() } })
    off = bridge.on('ai:chunk', (data: unknown) => {
      const chunk = data as { id: string; bytes?: number[]; done?: boolean; error?: { code: string; message: string; status: number } }
      if (chunk.id !== id || finished) return
      if (chunk.error) { finished = true; stream.error(new ProviderError(chunk.error.code, chunk.error.message, chunk.error.status)); cleanup() }
      else if (chunk.done) { finished = true; stream.close(); cleanup() }
      else if (chunk.bytes) stream.enqueue(new Uint8Array(chunk.bytes))
    })
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) { abort(); throw new DOMException('Request cancelled', 'AbortError') }
    try {
      const response = await bridge.invoke('ai:request', { ...request, id })
      if (response.error) throw new ProviderError(response.error.code, response.error.message, response.error.status)
      return new Response(body, { status: response.status, headers: { 'Content-Type': response.contentType } })
    } catch (error) { if (!finished) { finished = true; stream.close() }; cleanup(); throw error }
  }
  try { return await fetchModel(request, signal) }
  catch (error) {
    if (!(error instanceof ProviderError) || error.code !== 'network' || signal?.aborted) throw error
    // Fallback only for browser transport failures. Do not retry HTTP/auth/invalid API replies.
    try {
      const response = await fetch('/api/ai/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        if (payload?.error?.code) throw new ProviderError(payload.error.code, payload.error.message, response.status)
        throw new ProviderError('network', error.message + ' The Nuxt proxy is unavailable; run the desktop app/server or allow this site origin in the model server CORS settings.')
      }
      const type = response.headers.get('content-type') ?? ''
      if (!type.includes('application/json') && !type.includes('text/event-stream')) throw new ProviderError('network', error.message + ' The browser proxy returned a web page instead of an API response; use the desktop app or configure server CORS.')
      return response
    } catch (fallback) { if (fallback instanceof ProviderError) throw fallback; throw safeProviderError(fallback, request) }
  }
}
