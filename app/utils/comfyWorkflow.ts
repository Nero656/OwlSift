import type { ComfySettings, ComfyWorkflow, ComfyNodeCatalog, WorkflowAssessment, MediaKind, MediaOutput } from '~/types/media'
export const defaultComfySettings = (): ComfySettings => ({ enabled: false, endpoint: 'http://127.0.0.1:8188', serverToken: '', transport: 'proxy', workflowMode: 'builtin', checkpoint: '', workflowJson: '', promptBinding: { node: '', input: 'text' }, negativeBinding: { node: '', input: 'text' }, seedBinding: { node: '', input: 'seed' }, localOnly: true, cloudApiKey: '' })
export function normalizeComfySettings(value?: Partial<ComfySettings>): ComfySettings {
  const initial = defaultComfySettings()
  const text = (key: 'endpoint' | 'serverToken' | 'checkpoint' | 'workflowJson' | 'cloudApiKey') => typeof value?.[key] === 'string' ? value[key] : initial[key]
  const binding = (key: 'promptBinding' | 'negativeBinding' | 'seedBinding') => ({ node: typeof value?.[key]?.node === 'string' ? value[key].node : initial[key].node, input: typeof value?.[key]?.input === 'string' ? value[key].input : initial[key].input })
  return { enabled: value?.enabled === true, endpoint: text('endpoint'), serverToken: text('serverToken'), checkpoint: text('checkpoint'), workflowJson: text('workflowJson'), cloudApiKey: text('cloudApiKey'), localOnly: value?.localOnly !== false, transport: value?.transport === 'direct' ? 'direct' : 'proxy', workflowMode: value?.workflowMode === 'custom' ? 'custom' : 'builtin', promptBinding: binding('promptBinding'), negativeBinding: binding('negativeBinding'), seedBinding: binding('seedBinding') }
}
export function parseComfyWorkflow(text: string): ComfyWorkflow {
  if (text.length > 2000000) throw new Error('Workflow JSON is too large (maximum 2 MB).')
  const value = JSON.parse(text)
  const workflow = value?.prompt ?? value
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow) || Array.isArray(workflow.nodes) || !Object.keys(workflow).length) throw new Error('Export the workflow with File → Export (API), not the editor JSON format.')
  for (const [id, node] of Object.entries(workflow)) {
    const item = node as Record<string, unknown> | null
    if (!/^[a-z0-9_-]+$/i.test(id) || !item || typeof item.class_type !== 'string' || !item.inputs || typeof item.inputs !== 'object' || Array.isArray(item.inputs)) throw new Error('Invalid API workflow node: ' + id)
  }
  return workflow as ComfyWorkflow
}
export function builtInImageWorkflow(checkpoint: string): ComfyWorkflow {
  return {
    '3': { class_type: 'KSampler', inputs: { seed: 1, steps: 20, cfg: 7, sampler_name: 'euler', scheduler: 'normal', denoise: 1, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] } },
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: checkpoint } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512, batch_size: 1 } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['4', 1] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['4', 1] } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'OwlSift', images: ['8', 0] } },
  }
}
const builtinLocalNodes = new Set(['KSampler', 'CheckpointLoaderSimple', 'EmptyLatentImage', 'CLIPTextEncode', 'VAEDecode', 'SaveImage'])
export function assessWorkflow(workflow: ComfyWorkflow, catalog: ComfyNodeCatalog): WorkflowAssessment {
  const cloudNodes: string[] = [], unknownNodes: string[] = [], missingNodes: string[] = []
  for (const type of new Set(Object.values(workflow).map(node => node.class_type))) {
    const info = catalog[type]
    if (!info) { missingNodes.push(type); continue }
    if (info.api_node === true || /comfy_api_nodes/i.test(info.python_module ?? '') || /(^|\/)api(\/|$)/i.test(info.category ?? '')) cloudNodes.push(type)
    else if (!builtinLocalNodes.has(type) && info.python_module !== 'nodes' && !/^comfy_extras\./.test(info.python_module ?? '')) unknownNodes.push(type)
  }
  return { execution: cloudNodes.length ? 'cloud' : (unknownNodes.length || missingNodes.length) ? 'unverified' : 'local', cloudNodes, unknownNodes, missingNodes }
}
export function prepareImageWorkflow(settings: ComfySettings, params: { prompt: string; negative: string; seed: number; width: number; height: number }): ComfyWorkflow {
  const workflow = settings.workflowMode === 'builtin' ? builtInImageWorkflow(settings.checkpoint) : parseComfyWorkflow(settings.workflowJson)
  const setInput = (binding: { node: string; input: string }, value: string | number, required = false) => {
    if (!binding.node && !required) return
    const node = workflow[binding.node]
    if (!node || !Object.hasOwn(node.inputs, binding.input) || Array.isArray(node.inputs[binding.input])) throw new Error('Choose a literal workflow input for ' + binding.node + ':' + binding.input)
    if (typeof node.inputs[binding.input] !== typeof value) throw new Error('Workflow input has an incompatible type: ' + binding.input)
    node.inputs[binding.input] = value
  }
  if (settings.workflowMode === 'builtin') {
    if (!settings.checkpoint) throw new Error('Select an installed SD 1.x / SDXL checkpoint first.')
    workflow['6']!.inputs.text = params.prompt; workflow['7']!.inputs.text = params.negative
    workflow['3']!.inputs.seed = params.seed; workflow['5']!.inputs.width = params.width; workflow['5']!.inputs.height = params.height
  } else {
    setInput(settings.promptBinding, params.prompt, true)
    setInput(settings.negativeBinding, params.negative)
    setInput(settings.seedBinding, params.seed)
  }
  return workflow
}
/** Output adapters are separate from execution so audio/video can be added independently. */
export function extractMediaOutputs(outputs: Record<string, Record<string, unknown>>, kind: MediaKind = 'image'): MediaOutput[] {
  const keys: Record<MediaKind, string[]> = { image: ['images'], audio: ['audio'], video: ['videos', 'gifs'] }
  const result = new Map<string, MediaOutput>()
  for (const node of Object.values(outputs)) for (const key of keys[kind]) {
    const entries = node[key]
    if (!Array.isArray(entries)) continue
    for (const entry of entries) {
      if (!entry || typeof entry.filename !== 'string' || entry.type !== 'output' || /[\\/]/.test(entry.filename) || entry.filename.includes('..')) continue
      const subfolder = typeof entry.subfolder === 'string' ? entry.subfolder : ''
      if (subfolder.replace(/\\/g, '/').split('/').includes('..')) continue
      result.set(subfolder + '/' + entry.filename, { kind, filename: entry.filename, subfolder, type: 'output' })
    }
  }
  return [...result.values()]
}
