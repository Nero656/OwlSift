export interface LocalFile {
    id: number
    name: string
    path: string
    extension: string
    size: string
    mtime: string
    mtimeValue?: number
    tags: string[]
    snippet: string
    summary: string
    note: string
    content?: string
    contentError?: string
    thumbnail?: string
}

export interface IndexedFolder {
    name: string
    path: string
    count: number
}

export interface ChatFileReference {
    id: number
    name: string
    path?: string
    extension?: string
}

export interface ChatMessage {
    createdAt?: number
    provider?: 'comfy'
    mediaGeneration?: { provider: 'comfy'; jobId: string; kind: 'image' | 'audio' | 'video'; execution: 'local' | 'cloud' | 'unverified' }
    sender: 'user' | 'ai'
    text: string
    attachments?: ChatFileReference[]
    editedFiles?: ChatFileReference[]
    createdFiles?: ChatFileReference[]
}
