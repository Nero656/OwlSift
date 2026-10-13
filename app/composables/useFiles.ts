import type { IndexedFolder, LocalFile } from '../types/file'

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
}

function toLocalFile(file: IndexedFileRecord): LocalFile {
    return {
        id: file.id,
        name: file.name,
        path: file.path,
        extension: file.extension,
        size: formatFileSize(file.size),
        mtime: new Date(file.mtime).toLocaleDateString(),
        mtimeValue: file.mtime,
        tags: file.tags,
        snippet: file.snippet,
        summary: '',
        note: file.note ?? '',
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
    const selectedTag = useState<string | null>('selected-file-tag', () => null)
    const selectedFolder = useState<string | null>('selected-folder', () => null)
    const sortBy = useState('file-sort', () => 'relevance')
    const activeFile = useState<LocalFile | null>('active-file', () => null)
    const showFilePreview = useState('show-file-preview', () => true)
    const maxFilesPerFolder = useState('max-files-per-folder', () => 1000)
    let searchRequestId = 0

    const isElectron = typeof window !== 'undefined' && 'electron' in window

    onMounted(() => {
        const savedLimit = Number(localStorage.getItem('max-files-per-folder'))
        if ([100, 500, 1000, 2500, 5000].includes(savedLimit)) maxFilesPerFolder.value = savedLimit
    })
    watch(maxFilesPerFolder, (limit) => {
        if (import.meta.client) localStorage.setItem('max-files-per-folder', String(limit))
    })

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
        const result = await window.electron.invoke('files:choose-and-index', { maxFiles: maxFilesPerFolder.value })
        if (result) await loadIndex()
        return result
    }

    const removeIndexedFolder = async (folderPath: string) => {
        if (!isElectron) throw new Error('Removing indexed folders is available in the desktop app')
        await window.electron.invoke('folders:remove-from-index', folderPath)
        if (folders.value.find(folder => folder.path === folderPath)?.name === selectedFolder.value) {
            selectedFolder.value = null
        }
        await loadIndex()
        searchResults.value = null
        if (searchQuery.value.trim()) await searchIndexedFiles(searchQuery.value)
    }

    const addTagToFile = async (fileId: number, tag: string) => {
        if (!isElectron) return
        const tags = await window.electron.invoke('files:add-tag', { fileId, tag })
        const update = (file: LocalFile) => file.id === fileId ? { ...file, tags } : file
        files.value = files.value.map(update)
        if (searchResults.value) searchResults.value = searchResults.value.map(update)
        if (activeFile.value?.id === fileId) activeFile.value = update(activeFile.value)
        return tags
    }

    const removeTagFromFile = async (fileId: number, tag: string) => {
        if (!isElectron) return
        const tags = await window.electron.invoke('files:remove-tag', { fileId, tag })
        const update = (file: LocalFile) => file.id === fileId ? { ...file, tags } : file
        files.value = files.value.map(update)
        if (searchResults.value) searchResults.value = searchResults.value.map(update)
        if (activeFile.value?.id === fileId) activeFile.value = update(activeFile.value)
        return tags
    }

    const updateFileNote = async (fileId: number, note: string) => {
        if (!isElectron) return
        await window.electron.invoke('files:set-note', { fileId, note })
        const update = (file: LocalFile) => file.id === fileId ? { ...file, note } : file
        files.value = files.value.map(update)
        if (searchResults.value) searchResults.value = searchResults.value.map(update)
        if (activeFile.value?.id === fileId) activeFile.value = update(activeFile.value)
    }

    const openIndexedFile = async (fileId: number) => {
        if (!isElectron) throw new Error('Opening indexed files is available in the desktop app')
        await window.electron.invoke('files:open', fileId)
    }

    const showIndexedFileInFolder = async (fileId: number) => {
        if (!isElectron) throw new Error('Showing files in the system file manager is available in the desktop app')
        await window.electron.invoke('files:show-in-folder', fileId)
    }

    const deleteIndexedFile = async (fileId: number) => {
        if (!isElectron) throw new Error('Removing indexed files is available in the desktop app')
        await window.electron.invoke('files:delete', { fileId })
        files.value = files.value.filter(file => file.id !== fileId)
        if (searchResults.value) searchResults.value = searchResults.value.filter(file => file.id !== fileId)
        if (activeFile.value?.id === fileId) activeFile.value = null
        folders.value = await window.electron.invoke('files:folders')
    }

    const deleteFileFromDisk = async (fileId: number, mode: 'trash' | 'permanent') => {
        if (!isElectron) throw new Error('Deleting files is available in the desktop app')
        await window.electron.invoke('files:delete-from-disk', { fileId, mode })
        files.value = files.value.filter(file => file.id !== fileId)
        if (searchResults.value) searchResults.value = searchResults.value.filter(file => file.id !== fileId)
        if (activeFile.value?.id === fileId) activeFile.value = null
        folders.value = await window.electron.invoke('files:folders')
    }

    const searchIndexedFiles = async (query: string) => {
        const request = ++searchRequestId
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
            if (request !== searchRequestId) return

            const indexedResults = records.map(toLocalFile)
            const tagTerms = query.trim().toLocaleLowerCase().split(/\s+/)
                .map(term => term.replace(/^#+/, '')).filter(Boolean)
            const localTagMatches = files.value.filter(file =>
                file.tags.some(tag => tagTerms.some(term => tag.toLocaleLowerCase().includes(term)))
            )
            const merged = new Map<number, LocalFile>()
            for (const file of [...indexedResults, ...localTagMatches]) merged.set(file.id, file)
            searchResults.value = [...merged.values()]
        } catch (error) {
            if (request !== searchRequestId) return
            console.error('Local file search failed:', error)
            const tagTerms = query.trim().toLocaleLowerCase().split(/\s+/)
                .map(term => term.replace(/^#+/, '')).filter(Boolean)
            searchResults.value = files.value.filter(file =>
                file.tags.some(tag => tagTerms.some(term => tag.toLocaleLowerCase().includes(term)))
            )
        }
    }

    const filteredFiles = computed(() => {
        const source = searchQuery.value.trim() && searchResults.value !== null
            ? searchResults.value
            : files.value
        const rawQuery = searchQuery.value.toLocaleLowerCase().trim()
        const query = rawQuery.replace(/^#+/, '')
        const tagTerms = rawQuery.split(/\s+/).map(term => term.replace(/^#+/, '')).filter(Boolean)
        const result = source.filter((file) => {
            const matchesQuery = !rawQuery || searchResults.value !== null ||
                file.name.toLowerCase().includes(query) || file.snippet.toLowerCase().includes(query) ||
                file.note.toLowerCase().includes(query) ||
                file.tags.some(tag => tagTerms.some(term => tag.toLocaleLowerCase().includes(term)))
            const matchesType = !selectedType.value || file.extension === selectedType.value
            const matchesTag = !selectedTag.value || file.tags.includes(selectedTag.value)
            const folderPath = folders.value.find(folder => folder.name === selectedFolder.value)?.path
            const matchesFolder = !selectedFolder.value || file.path.startsWith(folderPath ?? selectedFolder.value)
            return matchesQuery && matchesType && matchesTag && matchesFolder
        })

        return [...result].sort((a, b) => {
            if (sortBy.value === 'date') return (b.mtimeValue ?? 0) - (a.mtimeValue ?? 0)
            if (sortBy.value === 'name') return a.name.localeCompare(b.name)
            if (sortBy.value === 'tag') return (a.tags[0] ?? '').localeCompare(b.tags[0] ?? '') || a.name.localeCompare(b.name)
            return 0
        })
    })

    const allTags = computed(() => [...new Set(files.value.flatMap(file => file.tags))].sort((a, b) => a.localeCompare(b)))

    const selectFile = (file: LocalFile) => {
        activeFile.value = file
        showFilePreview.value = true
    }
    const getFileTypeCount = (extension: string) => files.value.filter(file => file.extension === extension).length

    return {
        files, folders, searchQuery, selectedType, selectedTag, selectedFolder, sortBy, allTags, maxFilesPerFolder,
        activeFile, filteredFiles, selectFile, getFileTypeCount,
        loadIndex, addFolder, removeIndexedFolder, addTagToFile, removeTagFromFile, updateFileNote, openIndexedFile, showIndexedFileInFolder, deleteIndexedFile, deleteFileFromDisk, searchIndexedFiles,
    }
}
