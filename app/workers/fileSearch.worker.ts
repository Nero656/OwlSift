import { BrowserSearch } from '../../src/services/browserSearch'

export type BrowserSearchFile = {
  id: number
  name: string
  content?: string
  snippet?: string
  note?: string
  tags: string[]
}

export type BrowserSearchRequest = { id: number; query: string; files?: BrowserSearchFile[] }
export type BrowserSearchResponse = { id: number; ids?: number[] }

let index: BrowserSearch<BrowserSearchFile> | undefined
self.onmessage = ({ data }: MessageEvent<BrowserSearchRequest>) => {
  try {
    if (data.files) index = new BrowserSearch(data.files)
    self.postMessage({ id: data.id, ids: index?.search(data.query).map(file => file.id) ?? [] } satisfies BrowserSearchResponse)
  } catch {
    index = undefined
    self.postMessage({ id: data.id } satisfies BrowserSearchResponse)
  }
}
