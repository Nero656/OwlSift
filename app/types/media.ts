import type { ChatFileReference } from './file'
export type MediaKind = 'image' | 'audio' | 'video'
export interface MediaBinding { node: string; input: string }
export interface ComfySettings {
  enabled: boolean
  endpoint: string
  serverToken: string
  transport: 'proxy' | 'direct'
  workflowMode: 'builtin' | 'z-image-turbo' | 'custom'
  checkpoint: string
  zImageDiffusionModel: string
  zImageTextEncoder: string
  zImageVae: string
  workflowJson: string
  promptBinding: MediaBinding
  negativeBinding: MediaBinding
  seedBinding: MediaBinding
  localOnly: boolean
  cloudApiKey: string
}
export interface ComfyNode { class_type: string; inputs: Record<string, unknown>; _meta?: { title?: string } }
export type ComfyWorkflow = Record<string, ComfyNode>
export interface ComfyNodeInfo { api_node?: boolean; python_module?: string; category?: string; input?: Record<string, Record<string, unknown>> }
export type ComfyNodeCatalog = Record<string, ComfyNodeInfo>
export interface WorkflowAssessment { execution: 'local' | 'cloud' | 'unverified'; cloudNodes: string[]; unknownNodes: string[]; missingNodes: string[] }
export interface MediaOutput { kind: MediaKind; filename: string; subfolder: string; type: 'output' }
export interface ComfyJob {
  id: string; endpoint: string; chatKey: string; folderPath: string; prompt: string
  phase: 'queued' | 'running' | 'saving' | 'done' | 'error' | 'stopped'
  status: string; progress: number | null; saved: ChatFileReference[]; execution: WorkflowAssessment['execution']
}
