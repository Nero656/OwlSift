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

const browserStorageKey = 'localmind-browser-files'
const textExtensions = new Set(['txt', 'md', 'markdown', 'csv', 'json', 'xml', 'html', 'htm', 'js', 'ts', 'vue', 'css', 'scss', 'yaml', 'yml', 'log', 'sql', 'py', 'java', 'c', 'cpp', 'h', 'sh'])

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function toLocalFile(file: IndexedFileRecord): LocalFile {
  return {
    id: file.id, name: file.name, path: file.path, extension: file.extension,
    size: formatFileSize(file.size), mtime: new Date(file.mtime).toLocaleDateString(), mtimeValue: file.mtime,
    tags: file.tags, snippet: file.snippet, summary: '', note: file.note ?? '',
  }
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
  const browserFilesLoaded = useState('browser-files-loaded', () => false)
  const isElectron = typeof window !== 'undefined' && 'electron' in window
  let searchRequestId = 0

  const saveBrowserFiles = () => {
    if (import.meta.client && !isElectron) localStorage.setItem(browserStorageKey, JSON.stringify(files.value))
  }
  const updateBrowserFile = (fileId: number, callback: (file: LocalFile) => LocalFile) => {
    files.value = files.value.map(file => file.id === fileId ? callback(file) : file)
    if (searchResults.value) searchResults.value = searchResults.value.map(file => file.id === fileId ? callback(file) : file)
    if (activeFile.value?.id === fileId) activeFile.value = callback(activeFile.value)
    saveBrowserFiles()
  }

  onMounted(() => {
    const savedLimit = Number(localStorage.getItem('max-files-per-folder'))
    if ([100, 500, 1000, 2500, 5000].includes(savedLimit)) maxFilesPerFolder.value = savedLimit
  })
  watch(maxFilesPerFolder, limit => { if (import.meta.client) localStorage.setItem('max-files-per-folder', String(limit)) })

  const loadIndex = async () => {
    if (!isElectron) {
      if (browserFilesLoaded.value) return
      try {
        const stored = JSON.parse(localStorage.getItem(browserStorageKey) ?? '[]')
        files.value = Array.isArray(stored) ? stored : []
      } catch { files.value = [] }
      browserFilesLoaded.value = true
      return
    }
    const [records, indexedFolders] = await Promise.all([window.electron.invoke('files:list'), window.electron.invoke('files:folders')])
    files.value = records.map(toLocalFile)
    folders.value = indexedFolders
    if (activeFile.value) activeFile.value = files.value.find(file => file.path === activeFile.value?.path) ?? null
  }

  const addFolder = async () => {
    if (!isElectron) return null
    const result = await window.electron.invoke('files:choose-and-index', { maxFiles: maxFilesPerFolder.value })
    if (result) await loadIndex()
    return result
  }

  const addBrowserFile = async (source: File) => {
    const extension = source.name.includes('.') ? source.name.split('.').pop()?.toLowerCase() ?? '' : ''
    const content = (source.type.startsWith('text/') || textExtensions.has(extension)) && source.size <= 1024 * 1024 ? await source.text() : ''
    const file: LocalFile = {
      id: Date.now() + Math.floor(Math.random() * 1000), name: source.name, path: `Browser / ${source.name}`,
      extension, size: formatFileSize(source.size), mtime: new Date(source.lastModified || Date.now()).toLocaleDateString(),
      mtimeValue: source.lastModified || Date.now(), tags: [], snippet: content.slice(0, 240) || (extension ? `.${extension.toUpperCase()} file` : 'File'), summary: '', note: '',
    }
    files.value = [file, ...files.value]
    saveBrowserFiles()
    return file
  }

  const createBrowserFile = async (baseName: string, extension: string, content: string) => {
    const safeName = baseName.trim().replace(/[\\/:*?"<>|]/g, '-') || 'untitled'
    const cleanExtension = extension.replace(/^\./, '')
    const name = `${safeName}.${cleanExtension}`
    const blob = new Blob([content], { type: cleanExtension === 'json' ? 'application/json' : 'text/plain;charset=utf-8' })
    const picker = (window as Window & { showDirectoryPicker?: () => Promise<any> }).showDirectoryPicker
    if (picker) {
      try {
        const directory = await picker()
        const handle = await directory.getFileHandle(name, { create: true })
        const writable = await handle.createWritable()
        await writable.write(content)
        await writable.close()
      } catch (error: any) {
        if (error?.name !== 'AbortError') throw error
      }
    } else {
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = name; anchor.click()
      URL.revokeObjectURL(url)
    }
    return addBrowserFile(new File([blob], name, { type: blob.type, lastModified: Date.now() }))
  }

  const removeIndexedFolder = async (folderPath: string) => {
    if (!isElectron) return
    await window.electron.invoke('folders:remove-from-index', folderPath)
    if (folders.value.find(folder => folder.path === folderPath)?.name === selectedFolder.value) selectedFolder.value = null
    await loadIndex()
  }

  const addTagToFile = async (fileId: number, rawTag: string) => {
    if (!isElectron) {
      const tag = rawTag.trim().replace(/^#+/, '').slice(0, 40)
      const tags = [...new Set([...(files.value.find(file => file.id === fileId)?.tags ?? []), tag].filter(Boolean))]
      updateBrowserFile(fileId, file => ({ ...file, tags }))
      return tags
    }
    const tags = await window.electron.invoke('files:add-tag', { fileId, tag: rawTag })
    const update = (file: LocalFile) => file.id === fileId ? { ...file, tags } : file
    files.value = files.value.map(update); if (searchResults.value) searchResults.value = searchResults.value.map(update)
    if (activeFile.value?.id === fileId) activeFile.value = update(activeFile.value)
    return tags
  }

  const removeTagFromFile = async (fileId: number, tag: string) => {
    if (!isElectron) {
      const tags = (files.value.find(file => file.id === fileId)?.tags ?? []).filter(item => item !== tag)
      updateBrowserFile(fileId, file => ({ ...file, tags }))
      return tags
    }
    const tags = await window.electron.invoke('files:remove-tag', { fileId, tag })
    const update = (file: LocalFile) => file.id === fileId ? { ...file, tags } : file
    files.value = files.value.map(update); if (searchResults.value) searchResults.value = searchResults.value.map(update)
    if (activeFile.value?.id === fileId) activeFile.value = update(activeFile.value)
    return tags
  }

  const updateFileNote = async (fileId: number, note: string) => {
    if (!isElectron) { updateBrowserFile(fileId, file => ({ ...file, note })); return }
    await window.electron.invoke('files:set-note', { fileId, note })
    const update = (file: LocalFile) => file.id === fileId ? { ...file, note } : file
    files.value = files.value.map(update); if (activeFile.value?.id === fileId) activeFile.value = update(activeFile.value)
  }

  const openIndexedFile = async (fileId: number) => { if (isElectron) await window.electron.invoke('files:open', fileId) }
  const showIndexedFileInFolder = async (fileId: number) => { if (isElectron) await window.electron.invoke('files:show-in-folder', fileId) }
  const deleteIndexedFile = async (fileId: number) => {
    if (isElectron) await window.electron.invoke('files:delete', { fileId })
    files.value = files.value.filter(file => file.id !== fileId)
    if (searchResults.value) searchResults.value = searchResults.value.filter(file => file.id !== fileId)
    if (activeFile.value?.id === fileId) activeFile.value = null
    if (isElectron) folders.value = await window.electron.invoke('files:folders'); else saveBrowserFiles()
  }
  const deleteFileFromDisk = async (fileId: number, mode: 'trash' | 'permanent') => {
    if (!isElectron) return deleteIndexedFile(fileId)
    await window.electron.invoke('files:delete-from-disk', { fileId, mode }); await deleteIndexedFile(fileId)
  }

  const searchIndexedFiles = async (query: string) => {
    const request = ++searchRequestId
    if (!query.trim()) { searchResults.value = null; return }
    if (!isElectron) {
      const terms = query.toLocaleLowerCase().split(/\s+/).map(term => term.replace(/^#+/, '')).filter(Boolean)
      searchResults.value = files.value.filter(file => terms.every(term => [file.name, file.snippet, file.note, ...file.tags].join(' ').toLocaleLowerCase().includes(term)))
      return
    }
    const records = await window.electron.invoke('files:search', query)
    if (request !== searchRequestId) return
    searchResults.value = records.map(toLocalFile)
  }

  const filteredFiles = computed(() => {
    const source = searchQuery.value.trim() && searchResults.value !== null ? searchResults.value : files.value
    return source.filter(file => {
      const matchesType = !selectedType.value || file.extension === selectedType.value
      const matchesTag = !selectedTag.value || file.tags.includes(selectedTag.value)
      const folderPath = folders.value.find(folder => folder.name === selectedFolder.value)?.path
      return matchesType && matchesTag && (!selectedFolder.value || file.path.startsWith(folderPath ?? selectedFolder.value))
    }).sort((a, b) => {
      if (sortBy.value === 'date') return (b.mtimeValue ?? 0) - (a.mtimeValue ?? 0)
      if (sortBy.value === 'name') return a.name.localeCompare(b.name)
      if (sortBy.value === 'tag') return (a.tags[0] ?? '').localeCompare(b.tags[0] ?? '') || a.name.localeCompare(b.name)
      return 0
    })
  })
  const allTags = computed(() => [...new Set(files.value.flatMap(file => file.tags))].sort((a, b) => a.localeCompare(b)))
  const selectFile = (file: LocalFile) => { activeFile.value = file; showFilePreview.value = true }
  const getFileTypeCount = (extension: string) => files.value.filter(file => file.extension === extension).length

  return { files, folders, searchQuery, selectedType, selectedTag, selectedFolder, sortBy, allTags, maxFilesPerFolder, activeFile, filteredFiles, selectFile, getFileTypeCount, loadIndex, addFolder, addBrowserFile, createBrowserFile, removeIndexedFolder, addTagToFile, removeTagFromFile, updateFileNote, openIndexedFile, showIndexedFileInFolder, deleteIndexedFile, deleteFileFromDisk, searchIndexedFiles }
}
