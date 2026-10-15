interface IndexedFileRecord {
  id: number
  name: string
  path: string
  extension: string
  size: number
  mtime: number
  snippet: string
  tags: string[]
  note: string
  tags: string[]
  note: string
}

interface ElectronBridge {
  platform: string
  getPathForFile(file: File): string
  invoke(channel: 'files:import-drop', data: { filePath: string; folderPath?: string; maxFiles: number }): Promise<string>
  invoke(channel: 'files:get-bytes', fileId: number): Promise<number[]>
  invoke(channel: 'app:open-ai-doc', id: string): Promise<void>;
    invoke(channel: 'app:open-donation'): Promise<void>
  invoke(channel: 'files:list'): Promise<IndexedFileRecord[]>
  invoke(channel: 'files:add-tag', data: { fileId: number; tag: string }): Promise<string[]>
  invoke(channel: 'files:remove-tag', data: { fileId: number; tag: string }): Promise<string[]>
  invoke(channel: 'files:set-note', data: { fileId: number; note: string }): Promise<void>
  invoke(channel: 'files:open', fileId: number): Promise<void>
  invoke(channel: 'files:show-in-folder', fileId: number): Promise<void>
  invoke(channel: 'files:delete', data: { fileId: number }): Promise<void>
  invoke(channel: 'files:delete-from-disk', data: { fileId: number; mode: 'trash' | 'permanent' }): Promise<void>
  invoke(channel: 'files:get-image-preview', fileId: number): Promise<string | null>
  invoke(channel: 'files:folders'): Promise<Array<{ name: string; path: string; count: number }>>
  invoke(channel: 'files:search', query: string): Promise<IndexedFileRecord[]>
  invoke(channel: 'files:choose-and-index', data?: { maxFiles?: number }): Promise<{ folderPath: string; indexedCount: number; skippedCount: number; limit: number } | null>
  invoke(channel: 'files:choose-and-index-file', data?: { folderPath?: string }): Promise<{ folderPath: string; indexedCount: number; skippedCount: number; limit: number } | null>
  invoke(channel: 'files:create-in-folder', data: { folderPath: string; fileName: string; content: string; bytes?: number[] }): Promise<{ folderPath: string; indexedCount: number; skippedCount: number; limit: number }>
  invoke(channel: 'files:get-content', fileId: number): Promise<string>
  invoke(channel: 'folders:remove-from-index', folderPath: string): Promise<void>
  invoke(channel: 'db:get-status'): Promise<{ connected: boolean; fileCount: number; sizeBytes: number; fts5Available: boolean }>
}

declare global {
  interface Window {
    electron: ElectronBridge
  }
}

export {}
