import type { WorkspaceTransferRequest, WorkspaceTransferResult } from '../../src/types/workspace';
import type { DocumentScanRequest, DocumentScanResult, DocumentScanStatus } from '../../src/types/documentScan';
import type { ComfyRequest, ComfyResponse } from '../../src/services/comfyTransport'
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
  invoke(channel: 'comfy:request', request: ComfyRequest): Promise<ComfyResponse>;
  invoke(channel: 'files:import-drop', data: { filePath: string; folderPath?: string; maxFiles: number }): Promise<string>
  invoke(channel: 'files:get-bytes', fileId: number): Promise<number[]>
  invoke(channel: 'app:open-external', href: string): Promise<void>;
  invoke(channel: 'app:open-ai-doc', id: string): Promise<void>;
    invoke(channel: 'app:open-donation'): Promise<void>
  invoke(channel: 'files:set-system-visibility', include: boolean): Promise<void>;
  invoke(channel: 'files:list'): Promise<IndexedFileRecord[]>
  invoke(channel: 'files:add-tag', data: { fileId: number; tag: string }): Promise<string[]>
  invoke(channel: 'files:remove-tag', data: { fileId: number; tag: string }): Promise<string[]>
  invoke(channel: 'files:set-note', data: { fileId: number; note: string }): Promise<void>
  invoke(channel: 'files:open', fileId: number): Promise<void>
  invoke(channel: 'files:rename', data: { fileId: number; name: string }): Promise<{ path: string; name: string; extension: string; size: number; mtime: number }>
  invoke(channel: 'files:show-in-folder', fileId: number): Promise<void>
  invoke(channel: 'files:delete', data: { fileId: number }): Promise<void>
  invoke(channel: 'files:delete-from-disk', data: { fileId: number; mode: 'trash' | 'permanent' }): Promise<void>
  invoke(channel: 'files:get-image-preview', fileId: number): Promise<string | null>
  invoke(channel: 'files:folders'): Promise<Array<{ name: string; path: string; count: number }>>
  invoke(channel: 'files:search', query: string): Promise<IndexedFileRecord[]>
  invoke(channel: 'files:stop-document-scan'): Promise<boolean>;
  invoke(channel: 'files:document-scan-status'): Promise<DocumentScanStatus>;
  invoke(channel: 'files:choose-scan-folders', data: { drivePath: string }): Promise<string[] | null>;
  invoke(channel: 'files:list-scan-drives'): Promise<Array<{ path: string; label: string }>>
  invoke(channel: 'files:scan-os-documents', data: DocumentScanRequest): Promise<DocumentScanResult>
  invoke(channel: 'files:choose-and-index', data?: { maxFiles?: number }): Promise<{ folderPath: string; indexedCount: number; skippedCount: number; limit: number } | null>
  invoke(channel: 'files:choose-and-index-file', data?: { folderPath?: string; maxFiles?: number }): Promise<{ folderPath: string; indexedCount: number; skippedCount: number; limit: number } | null>
  invoke(channel: 'files:edit-content', data: { fileId: number; content: string; bytes: number[]; expectedMtime: number }): Promise<void>;
  invoke(channel: 'files:create-in-folder', data: { folderPath: string; fileName: string; content: string; bytes?: number[] }): Promise<{ folderPath: string; indexedCount: number; skippedCount: number; limit: number }>
  invoke(channel: 'files:get-content', fileId: number): Promise<string>
  invoke(channel: 'folders:default-location'): Promise<string>;
  invoke(channel: 'folders:choose-parent'): Promise<string | null>;
  invoke(channel: 'folders:create', data: {parentPath:string;name:string}): Promise<{name:string;path:string;count:number}>;
  invoke(channel: 'files:transfer-workspace', data: WorkspaceTransferRequest): Promise<WorkspaceTransferResult>;
  invoke(channel: 'folders:remove-from-index', folderPath: string): Promise<void>
  invoke(channel: 'db:get-status'): Promise<{ connected: boolean; fileCount: number; sizeBytes: number; fts5Available: boolean }>
}

declare global {
  interface Window {
    electron: ElectronBridge
  }
}

export {}
