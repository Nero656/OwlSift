import type { ComfySettings, ComfyNodeCatalog, ComfyJob } from '~/types/media'
import type { ComfyRequest, ComfyResponse } from '../../src/services/comfyTransport'
import type { ChatMessage } from '~/types/file'
import { assessWorkflow, builtInImageWorkflow, parseComfyWorkflow, prepareImageWorkflow, extractMediaOutputs } from '~/utils/comfyWorkflow'
let stopWaiting = false
let activeSocket: WebSocket | undefined
let activeConfig: ComfySettings | undefined

const signature = (config: ComfySettings) => JSON.stringify([config.endpoint.trim().replace(/\/+$/, ''), config.serverToken, config.transport])
function errorText(error: unknown): string {
  const data = (error as { data?: { data?: { message?: string }; message?: string } })?.data
  return data?.data?.message ?? data?.message ?? (error instanceof Error ? error.message : String(error))
}
async function transport(config: ComfySettings, path: string, options: Partial<ComfyRequest> = {}): Promise<ComfyResponse> {
  const request: ComfyRequest = { ...options, endpoint: config.endpoint.trim().replace(/\/+$/, ''), token: config.serverToken, path }
  if (import.meta.client && window.electron) return window.electron.invoke('comfy:request', request)
  if (config.transport === 'proxy') return $fetch<ComfyResponse>('/api/comfy', { method: 'POST', body: request, timeout: 35000 })
  const response = await fetch(request.endpoint + path, { method: request.method ?? 'GET', headers: { ...(request.body ? { 'Content-Type': 'application/json' } : {}), ...(request.token ? { Authorization: 'Bearer ' + request.token } : {}) }, body: request.body === undefined ? undefined : JSON.stringify(request.body), signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error('Comfy HTTP ' + response.status + ': ' + (await response.text()).slice(0, 1000))
  if (request.binary) {
    const buffer = new Uint8Array(await response.arrayBuffer())
    if (buffer.length > 30 * 1024 * 1024) throw new Error('Image exceeds 30 MB')
    let binary = ''; for (let i = 0; i < buffer.length; i += 8192) binary += String.fromCharCode(...buffer.subarray(i, i + 8192))
    return { base64: btoa(binary), mime: response.headers.get('content-type')?.split(';')[0] ?? '' }
  }
  const text = await response.text()
  return { data: text ? JSON.parse(text) : {} }
}
export function useComfy() {
  const { settings } = useSettings()
  const { t } = useLanguage()
  const { folders, saveGeneratedMedia } = useFiles()
  const catalog = useState<ComfyNodeCatalog>('comfy-node-catalog', () => ({}))
  const checkpoints = useState<string[]>('comfy-checkpoints', () => [])
  const verifiedSignature = useState('comfy-verified-signature', () => '')
  const testing = useState('comfy-testing', () => false)
  const busy = useState('comfy-busy', () => false)
  const error = useState('comfy-error', () => '')
  const job = useState<ComfyJob | null>('comfy-job', () => null)
  const conversations = useState<Record<string, ChatMessage[]>>('ai-conversations', () => ({}))
  const connected = computed(() => verifiedSignature.value === signature(settings.value.comfy))
  const workflowError = computed(() => {
    if (settings.value.comfy.workflowMode !== 'custom') return ''
    try { parseComfyWorkflow(settings.value.comfy.workflowJson); return '' } catch (error) { return errorText(error) }
  })
  const workflow = computed(() => {
    try { return settings.value.comfy.workflowMode === 'custom' ? parseComfyWorkflow(settings.value.comfy.workflowJson) : builtInImageWorkflow(settings.value.comfy.checkpoint) } catch { return {} }
  })
  const assessment = computed(() => assessWorkflow(workflow.value, connected.value ? catalog.value : {}))
  const verify = async () => {
    if (testing.value) return
    testing.value = true; error.value = ''; verifiedSignature.value = ''
    const config = structuredClone(toRaw(settings.value.comfy))
    try {
      const stats = await transport(config, '/system_stats')
      if (!stats.data || typeof stats.data !== 'object' || !('system' in stats.data)) throw new Error('The endpoint is not a ComfyUI server. Enter the server base URL without /v1 or /api.')
      const nodeResponse = await transport(config, '/object_info')
      const nodes = nodeResponse.data as ComfyNodeCatalog
      if (!nodes || typeof nodes !== 'object' || !Object.keys(nodes).length) throw new Error('The server returned no node definitions')
      let models: string[] = []
      try { const response = await transport(config, '/models/checkpoints'); if (Array.isArray(response.data)) models = response.data.filter((value): value is string => typeof value === 'string') } catch { /* Custom workflows may use separate diffusion and text encoders. */ }
      if (!models.length) {
        const definition = nodes.CheckpointLoaderSimple?.input?.required?.ckpt_name
        const choices = Array.isArray(definition) ? definition[0] : undefined
        if (Array.isArray(choices)) models = choices.filter((value): value is string => typeof value === 'string')
      }
      if (signature(config) !== signature(settings.value.comfy)) return
      catalog.value = nodes; checkpoints.value = models; verifiedSignature.value = signature(config)
    } catch (issue) { error.value = errorText(issue).split(config.serverToken || '\0').join(config.serverToken ? '[redacted]' : '\0') }
    finally { testing.value = false }
  }
  const generate = async (params: { prompt: string; negative: string; seed: number; width: number; height: number; folderPath: string; chatKey: string; acknowledgeExternal: boolean }) => {
    if (busy.value) return
    busy.value = true; error.value = ''; stopWaiting = false; job.value = null
    const config = structuredClone(toRaw(settings.value.comfy))
    activeConfig = config
    let message: ChatMessage | undefined
    try {
      if (!config.enabled || !connected.value) throw new Error(t('comfyConnectFirst'))
      if (!params.prompt.trim() || params.prompt.length > 20000) throw new Error(t('comfyPromptRequired'))
      if (!folders.value.some(folder => folder.path === params.folderPath)) throw new Error(t('outputFolderUnavailable'))
      const graph = prepareImageWorkflow(config, params)
      const audit = assessWorkflow(graph, catalog.value)
      if (audit.missingNodes.length) throw new Error(t('comfyMissingNodes') + ' ' + audit.missingNodes.join(', '))
      if (audit.execution !== 'local' && (config.localOnly || !params.acknowledgeExternal)) throw new Error(t('comfyExternalConsent'))
      if (!Number.isSafeInteger(params.seed) || params.seed < 0 || ![512, 768, 1024].includes(params.width) || ![512, 768, 1024].includes(params.height)) throw new Error('Invalid image size or seed')
      const target = conversations.value[params.chatKey] ?? (conversations.value[params.chatKey] = [])
      target.push({ sender: 'user', text: params.prompt, createdAt: Date.now() })
      target.push({ sender: 'ai', provider: 'comfy', text: t('comfySubmitting'), createdAt: Date.now(), createdFiles: [] })
      message = target[target.length - 1]!
      const clientId = globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)
      // Progress via WebSocket is optional; history/queue polling also works through the proxy.
      if (!config.serverToken) try {
        const ws = new URL(config.endpoint); ws.protocol = ws.protocol === 'https:' ? 'wss:' : 'ws:'; ws.pathname = ws.pathname.replace(/\/$/, '') + '/ws'; ws.searchParams.set('clientId', clientId)
        activeSocket = new WebSocket(ws)
        activeSocket.onmessage = event => {
          if (typeof event.data !== 'string') return
          try { const frame = JSON.parse(event.data); if (frame.data?.prompt_id !== job.value?.id) return; if (frame.type === 'progress' && frame.data.max > 0 && job.value) job.value.progress = Math.round(100 * frame.data.value / frame.data.max) } catch { /* Binary previews and optional events do not affect completion. */ }
        }
        activeSocket.onerror = () => { /* Queue/history polling remains available. */ }
      } catch { /* Polling is sufficient. */ }
      const response = await transport(config, '/prompt', { method: 'POST', body: { prompt: graph, client_id: clientId, ...(audit.cloudNodes.length && config.cloudApiKey ? { extra_data: { api_key_comfy_org: config.cloudApiKey } } : {}) } })
      const accepted = response.data as { prompt_id?: string; error?: unknown; node_errors?: unknown }
      if (!accepted?.prompt_id || (accepted.node_errors && Object.keys(accepted.node_errors).length)) throw new Error(JSON.stringify(accepted?.error ?? accepted?.node_errors ?? response.data))
      job.value = { id: accepted.prompt_id, endpoint: config.endpoint, chatKey: params.chatKey, folderPath: params.folderPath, prompt: params.prompt, phase: 'queued', status: t('comfyQueued'), progress: null, saved: [], execution: audit.execution }
      if (stopWaiting) try { await transport(config, '/queue', { method: 'POST', body: { delete: [accepted.prompt_id] } }) } catch { /* The running job can still finish in Comfy. */ }
      message.mediaGeneration = { provider: 'comfy', jobId: accepted.prompt_id, kind: 'image', execution: audit.execution }
      const started = Date.now()
      while (!stopWaiting) {
        if (Date.now() - started > 60 * 60 * 1000) throw new Error('Stopped waiting after one hour. Check the job in Comfy Desktop: ' + accepted.prompt_id)
        const response = await transport(config, '/history/' + encodeURIComponent(accepted.prompt_id))
        const entry = (response.data as Record<string, { outputs?: Record<string, Record<string, unknown>>; status?: { status_str?: string; completed?: boolean; messages?: Array<[string, { exception_message?: string }]> } }>)?.[accepted.prompt_id]
        if (entry?.status?.status_str === 'error' || entry?.status?.messages?.some(([type]) => type === 'execution_error' || type === 'execution_interrupted')) {
          throw new Error(entry.status.messages?.find(([type]) => type === 'execution_error')?.[1]?.exception_message ?? t('comfyExecutionFailed'))
        }
        if (entry && (entry.status?.completed || (entry.outputs && !entry.status))) {
          const outputs = extractMediaOutputs(entry.outputs ?? {}, 'image')
          if (!outputs.length) throw new Error(t('comfyNoImages'))
          if (outputs.length > 8) throw new Error('Workflow produced more than 8 images; reduce the batch size')
          job.value.phase = 'saving'; job.value.status = t('comfySaving'); message.text = t('comfySaving')
          for (const [index, output] of outputs.entries()) {
            if (stopWaiting) break
            const query = new URLSearchParams({ filename: output.filename, subfolder: output.subfolder, type: output.type })
            const result = await transport(config, '/view?' + query, { binary: true })
            if (!result.base64) throw new Error('Comfy returned an empty image')
            const binary = atob(result.base64); const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
            const blob = new Blob([bytes], { type: result.mime || 'application/octet-stream' })
            if (stopWaiting) break
            const saved = await saveGeneratedMedia(blob, 'comfy-' + accepted.prompt_id.slice(0, 8) + '-' + Date.now() + '-' + (index + 1), params.folderPath)
            job.value.saved.push({ id: saved.id, name: saved.name, path: saved.path, extension: saved.extension })
            message.createdFiles = [...job.value.saved]
          }
          if (!stopWaiting) { job.value.phase = 'done'; job.value.status = t('comfyDone'); job.value.progress = 100; message.text = t('comfyDone') + ' ' + job.value.saved.length }
          break
        }
        const queue = (await transport(config, '/queue')).data as { queue_running?: unknown[][]; queue_pending?: unknown[][] }
        const running = queue.queue_running?.some(item => item[1] === accepted.prompt_id)
        job.value.phase = running ? 'running' : 'queued'; job.value.status = running ? t('comfyRunning') : t('comfyQueued'); message.text = job.value.status
        await new Promise(resolve => setTimeout(resolve, 1500))
      }
      if (stopWaiting) { job.value.phase = 'stopped'; job.value.status = t('comfyStopped'); message.text = t('comfyStopped') }
    } catch (issue) {
      let text = errorText(issue)
      for (const secret of [config.serverToken, config.cloudApiKey]) if (secret) text = text.split(secret).join('[redacted]')
      error.value = text
      if (job.value) { job.value.phase = 'error'; job.value.status = text }
      if (message) message.text = t('comfyExecutionFailed') + ' ' + text
    } finally { activeSocket?.close(); activeSocket = undefined; activeConfig = undefined; busy.value = false }
  }
  const stop = async () => {
    stopWaiting = true
    // Delete only our pending item. A running workflow is left alone; /interrupt on older servers is global.
    if (activeConfig && job.value?.id && job.value.phase === 'queued') try { await transport(activeConfig, '/queue', { method: 'POST', body: { delete: [job.value.id] } }) } catch { /* Stopping the UI must remain possible when the server disconnects. */ }
  }
  return { connected, testing, busy, error, catalog, checkpoints, assessment, workflowError, workflow, job, verify, generate, stop }
}
