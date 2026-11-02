export interface DocumentScanRequest {
  drivePath: string
  extensions: string[]
  folderPaths?: string[]
  resume?: boolean
}

export interface DocumentScanResult {
  indexedCount: number
  skippedCount: number
  cancelled: boolean
}

export interface DocumentScanStatus extends DocumentScanRequest {
  running: boolean
  resumable: boolean
  phase: 'metadata' | 'content' | null
  indexedCount: number
  skippedCount: number
  contentCount: number
}
