export type WorkspaceTransferMode = 'copy' | 'move'
export interface WorkspaceTransferRequest {
  fileIds: number[]
  targetFolderPath: string
  mode: WorkspaceTransferMode
  maxFiles?: number
}
export interface WorkspaceTransferResult {
  completed: Array<{ sourceId: number; id: number; oldPath: string; path: string; name: string }>
  failed: Array<{ fileId: number; message: string }>
}
