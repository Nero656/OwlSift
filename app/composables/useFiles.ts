import type { IndexedFolder, LocalFile } from '../types/file'

interface IndexedFileRecord {
    id: number
    name: string
    path: string
    extension: string
    size: number
    mtime: number
    snippet: string
}

function toLocalFile(file: IndexedFileRecord): LocalFile {
    return {
        id: file.id,
        name: file.name,
        path: file.path,
        extension: file.extension,
        size: formatFileSize(file.size),
        mtime: new Date(file.mtime).toLocaleDateString(),
        tags: [],
        snippet: file.snippet,
        summary: '',
        note: '',
    }
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export const useFiles = () => {
    const files = useState<LocalFile[]>('files', () => [])
    const folders = useState<IndexedFolder[]>('indexed-folders', () => [])
    const searchResults = useState<LocalFile[] | null>('file-search-results', () => null)
    const searchQuery = useState('search-query', () => '')
    const selectedType = useState<string | null>('selected-file-type', () => null)
    const selectedFolder = useState<string | null>('selected-folder', () => null)
    const sortBy = useState('file-sort', () => 'relevance')
    const activeFile = useState<LocalFile | null>('active-file', () => null)

    const isElectron = typeof window !== 'undefined' && 'electron' in window

    const loadIndex = async () => {
        if (!isElectron) return
        try {
            const [records, indexedFolders] = await Promise.all([
                window.electron.invoke('files:list'),
                window.electron.invoke('files:folders'),
            ])
            files.value = records.map(toLocalFile)
            folders.value = indexedFolders
            if (activeFile.value) {
                activeFile.value = files.value.find(file => file.path === activeFile.value?.path) ?? null
            }
        } catch (error) {
            console.error('Could not load local file index:', error)
        }
    }

    const addFolder = async () => {
        if (!isElectron) return null
        const result = await window.electron.invoke('files:choose-and-index')
        if (result) await loadIndex()
        return result
    }

    const searchIndexedFiles = async (query: string) => {
        if (!query.trim()) {
            searchResults.value = null
            return
        }
        if (!isElectron) {
            searchResults.value = null
            return
        }
        try {
            const records = await window.electron.invoke('files:search', query)
            searchResults.value = records.map(toLocalFile)
        } catch (error) {
            console.error('Local file search failed:', error)
            searchResults.value = []
        }
    }

    const filteredFiles = computed(() => {
        const source = searchQuery.value.trim() && searchResults.value !== null
            ? searchResults.value
            : files.value
        const query = searchQuery.value.toLowerCase().trim()
        const result = source.filter((file) => {
            const matchesQuery = !query || searchResults.value !== null ||
                file.name.toLowerCase().includes(query) || file.snippet.toLowerCase().includes(query)
            const matchesType = !selectedType.value || file.extension === selectedType.value
            const folderPath = folders.value.find(folder => folder.name === selectedFolder.value)?.path
            const matchesFolder = !selectedFolder.value || file.path.startsWith(folderPath ?? selectedFolder.value)
            return matchesQuery && matchesType && matchesFolder
        })

        return [...result].sort((a, b) => {
            if (sortBy.value === 'date') return new Date(b.mtime).getTime() - new Date(a.mtime).getTime()
            if (sortBy.value === 'name') return a.name.localeCompare(b.name)
            return 0
        })
    })

    const selectFile = (file: LocalFile) => { activeFile.value = file }
    const getFileTypeCount = (extension: string) => files.value.filter(file => file.extension === extension).length

    return {
        files, folders, searchQuery, selectedType, selectedFolder, sortBy,
        activeFile, filteredFiles, selectFile, getFileTypeCount,
        loadIndex, addFolder, searchIndexedFiles,
    }
}
