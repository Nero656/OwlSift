export interface LocalFile {
    id: number
    name: string
    path: string
    extension: string
    size: string
    mtime: string
    tags: string[]
    snippet: string
    summary: string
    note: string
}

export interface IndexedFolder {
    name: string
    path: string
    count: number
}

export interface ChatMessage {
    sender: 'user' | 'ai'
    text: string
}