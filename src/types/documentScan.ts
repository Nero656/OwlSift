export type ScanMode = 'auto' | 'ssd' | 'hdd'

export interface DocumentScanRequest {
  drivePath: string
  additionalDrivePaths?: string[]
  extensions: string[]
  folderPaths?: string[]
  resume?: boolean
  mode?: ScanMode
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
  contentTotal: number | null
  contentProcessed: number
  scanTotal: number | null
  scanProcessed: number
}
