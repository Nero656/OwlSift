export interface ComfyRequest { endpoint: string; path: string; method?: 'GET' | 'POST'; body?: unknown; token?: string; binary?: boolean }
export interface ComfyResponse { data?: unknown; base64?: string; mime?: string; availability?: { status: number; workspaceAvailable: boolean } }
/** Restrict the bridge to the subset of the Comfy server API used by OwlSift. */
export async function requestComfy(input: ComfyRequest): Promise<ComfyResponse> {
  if (!input || typeof input.endpoint !== 'string' || typeof input.path !== 'string') throw new Error('Invalid Comfy server request')
  const base = new URL(input.endpoint)
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('Use an HTTP(S) server address without credentials or query parameters')
  const target = new URL(base.toString().replace(/\/$/, '') + '/' + input.path.replace(/^\//, ''))
  const apiPath = '/' + input.path.replace(/^\//, '').split('?')[0]
  const method = input.method ?? 'GET'
  const allowedGet = ['/', '/system_stats', '/object_info', '/models/checkpoints', '/models/diffusion_models', '/models/text_encoders', '/models/vae', '/queue', '/view'].includes(apiPath) || /^\/history\/[a-z0-9-]+$/i.test(apiPath)
  const allowedPost = ['/prompt', '/queue'].includes(apiPath)
  if (target.origin !== base.origin || (method === 'GET' ? !allowedGet : method === 'POST' ? !allowedPost : true)) throw new Error('Unsupported Comfy API operation')
  if (apiPath === '/view') {
    const filename = target.searchParams.get('filename') ?? ''
    const subfolder = target.searchParams.get('subfolder') ?? ''
    if (!filename || /[\\/]/.test(filename) || filename.includes('..') || subfolder.replace(/\\/g, '/').split('/').includes('..') || target.searchParams.get('type') !== 'output') throw new Error('Invalid output file reference')
  }
  const body = input.body === undefined ? undefined : JSON.stringify(input.body)
  if (body && body.length > 2500000) throw new Error('Comfy request exceeds 2.5 MB')
  const response = await fetch(target, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(input.token ? { Authorization: 'Bearer ' + input.token } : {}) }, body, signal: AbortSignal.timeout(30000), redirect: 'error', cache: 'no-store' })
  if (!response.ok && apiPath !== '/') {
    let message = (await response.text()).slice(0, 1500)
    const cloudKey = (input.body as { extra_data?: { api_key_comfy_org?: string } })?.extra_data?.api_key_comfy_org
    for (const secret of [input.token, cloudKey]) if (typeof secret === 'string' && secret) message = message.split(secret).join('[redacted]')
    throw new Error('Comfy HTTP ' + response.status + ': ' + message)
  }
  const reader = response.body?.getReader()
  const chunks: Uint8Array[] = []; let total = 0
  if (reader) try {
    while (true) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > 30 * 1024 * 1024) throw new Error('Comfy response exceeds 30 MB'); chunks.push(value) }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  const buffer = Buffer.concat(chunks)
  if (apiPath === '/') return { availability: { status: response.status, workspaceAvailable: response.ok && /<(?:!doctype\s+html|html)(?:\s|>)/i.test(buffer.toString('utf8')) } }
  if (input.binary) return { base64: buffer.toString('base64'), mime: response.headers.get('content-type')?.split(';')[0] ?? 'application/octet-stream' }
  return { data: buffer.length ? JSON.parse(buffer.toString('utf8')) : {} }
}
