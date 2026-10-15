import type { IndexedFolder, LocalFile } from '../types/file'
import { createDocumentBlob, extractDocumentText, storeDocumentBlob } from '../utils/documents'
import { creatableFileTypes, defaultFileTemplate } from './useFileTypes'

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
  content?: string
}

const browserStorageKey = 'localmind-browser-files'
const browserFoldersKey = 'localmind-browser-folders'
const textExtensions = new Set(['txt', 'md', 'markdown', 'csv', 'json', 'xml', 'html', 'htm', 'js', 'ts', 'vue', 'css', 'scss', 'yaml', 'yml', 'log', 'sql', 'py', 'java', 'c', 'cpp', 'h', 'sh'])
const defaultBrowserFolderPath = 'Browser/Workspace'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function toLocalFile(file: IndexedFileRecord): LocalFile {
  return {
    id: file.id, name: file.name, path: file.path, extension: file.extension,
    size: formatFileSize(file.size), mtime: new Date(file.mtime).toLocaleDateString(), mtimeValue: file.mtime,
    tags: file.tags, snippet: file.snippet, summary: '', note: file.note ?? '', content: file.content,
  }
}

function isDesktop() {
  return import.meta.client && Boolean(window.electron)
}

function sanitizeFileName(name: string) {
  return name.trim().replace(/[\\/:*?"<>|]/g, '-') || 'untitled'
}
async function createImageThumbnail(file: File): Promise<string | undefined> {
  if (!file.type.startsWith('image/') || typeof createImageBitmap === 'undefined') return undefined
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 320 / bitmap.width, 180 / bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) { bitmap.close(); return undefined }
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return canvas.toDataURL('image/jpeg', 0.72)
  } catch {
    return undefined
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
  const fileDialogFolder = useState<string | null>('file-dialog-folder', () => null)
  const isCreateFileOpen = useState('create-file-open', () => false)
  let searchRequestId = 0

  const saveBrowserState = () => {
    if (!import.meta.client || isDesktop()) return
    localStorage.setItem(browserStorageKey, JSON.stringify(files.value))
    localStorage.setItem(browserFoldersKey, JSON.stringify(folders.value.map(({ name, path }) => ({ name, path }))))
  }

  const refreshFolderCounts = () => {
    folders.value = folders.value.map(folder => ({
      ...folder,
      count: files.value.filter(file => file.path === folder.path || file.path.startsWith(`${folder.path}/`)).length,
    }))
  }

  const updateBrowserFile = (fileId: number, callback: (file: LocalFile) => LocalFile) => {
    files.value = files.value.map(file => file.id === fileId ? callback(file) : file)
    if (searchResults.value) searchResults.value = searchResults.value.map(file => file.id === fileId ? callback(file) : file)
    if (activeFile.value?.id === fileId) activeFile.value = callback(activeFile.value)
    saveBrowserState()
  }

  const ensureFolder = (folderPath?: string | null, folderName?: string): IndexedFolder => {
    if (folderPath) {
      const existing = folders.value.find(folder => folder.path === folderPath || folder.name === folderPath)
      if (existing) return existing
    }
    if (selectedFolder.value) {
      const selected = folders.value.find(folder => folder.name === selectedFolder.value)
      if (selected) return selected
    }
    if (folders.value[0]) return folders.value[0]
    const created: IndexedFolder = {
      name: folderName?.trim() || 'Workspace',
      path: folderPath || defaultBrowserFolderPath,
      count: 0,
    }
    folders.value = [...folders.value, created]
    return created
  }

  const createVirtualFolder = (rawName: string) => {
    const name = sanitizeFileName(rawName)
    const path = `Browser/${name}`
    if (!folders.value.some(folder => folder.path === path)) {
      folders.value = [...folders.value, { name, path, count: 0 }]
      saveBrowserState()
    }
    return folders.value.find(folder => folder.path === path)!
  }

  onMounted(() => {
    const savedLimit = Number(localStorage.getItem('max-files-per-folder'))
    if ([100, 500, 1000, 2500, 5000].includes(savedLimit)) maxFilesPerFolder.value = savedLimit
  })
  watch(maxFilesPerFolder, limit => { if (import.meta.client) localStorage.setItem('max-files-per-folder', String(limit)) })

  const loadIndex = async () => {
    if (!isDesktop()) {
      if (browserFilesLoaded.value) return
      try {
        const storedFiles = JSON.parse(localStorage.getItem(browserStorageKey) ?? '[]')
        files.value = Array.isArray(storedFiles) ? storedFiles : []
        const storedFolders = JSON.parse(localStorage.getItem(browserFoldersKey) ?? '[]') as Array<{ name: string; path: string }>
        folders.value = Array.isArray(storedFolders)
          ? storedFolders.map(folder => ({ ...folder, count: 0 }))
          : []
        if (!folders.value.length && files.value.length) {
          folders.value = [{ name: 'Workspace', path: defaultBrowserFolderPath, count: 0 }]
        }
        refreshFolderCounts()
      } catch {
        files.value = []
        folders.value = []
      }
      browserFilesLoaded.value = true
      return
    }
    const [records, indexedFolders] = await Promise.all([window.electron.invoke('files:list'), window.electron.invoke('files:folders')])
    files.value = records.map(toLocalFile)
    folders.value = indexedFolders
    if (activeFile.value) activeFile.value = files.value.find(file => file.path === activeFile.value?.path) ?? null
  }

  const addFolder = async () => {
    if (isDesktop()) {
      const result = await window.electron.invoke('files:choose-and-index', { maxFiles: maxFilesPerFolder.value })
      if (result) await loadIndex()
      return result
    }

    const picker = (window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker
    if (picker) {
      try {
        const directory = await picker()
        const folder = createVirtualFolder(directory.name)
        let indexedCount = 0
        let skippedCount = 0
        const visit = async (handle: FileSystemDirectoryHandle, prefix: string) => {
          for await (const [name, entry] of handle.entries()) {
            if (indexedCount >= maxFilesPerFolder.value) {
              skippedCount += 1
              continue
            }
            if (entry.kind === 'directory') {
              await visit(entry as FileSystemDirectoryHandle, `${prefix}/${name}`)
              continue
            }
            const source = await (entry as FileSystemFileHandle).getFile()
            await addBrowserFile(source, prefix)
            indexedCount += 1
          }
        }
        await visit(directory, folder.path)
        refreshFolderCounts()
        saveBrowserState()
        return { folderPath: folder.path, indexedCount, skippedCount, limit: maxFilesPerFolder.value }
      } catch (error: any) {
        if (error?.name === 'AbortError') return null
        throw error
      }
    }

    const name = window.prompt('Folder name')?.trim()
    if (!name) return null
    const folder = createVirtualFolder(name)
    return { folderPath: folder.path, indexedCount: 0, skippedCount: 0, limit: maxFilesPerFolder.value }
  }

  const addBrowserFile = async (source: File, folderPath?: string, indexedText?: string) => {
    const known = folderPath ? folders.value.find(folder => folder.path === folderPath || folder.name === folderPath) : undefined
    const targetPath = known?.path ?? folderPath ?? ensureFolder().path
    const extension = source.name.includes('.') ? source.name.split('.').pop()?.toLowerCase() ?? '' : ''
    let content = indexedText ?? '', contentError = ''
    if (indexedText === undefined && ['pdf', 'docx', 'odt'].includes(extension)) {
      try { content = await extractDocumentText(source); if (!content.trim()) contentError = 'No extractable text (scanned or empty document)' }
      catch (error) { contentError = error instanceof Error ? error.message : String(error) }
    } else if (indexedText === undefined && (source.type.startsWith('text/') || textExtensions.has(extension))) content = (await source.text()).slice(0, 120000)
    if (['pdf', 'docx', 'odt', 'rtf'].includes(extension)) await storeDocumentBlob(targetPath + '/' + source.name, source)
    const thumbnail = await createImageThumbnail(source)
    const file: LocalFile = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      name: source.name,
      path: `${targetPath}/${source.name}`,
      extension,
      size: formatFileSize(source.size),
      mtime: new Date(source.lastModified || Date.now()).toLocaleDateString(),
      mtimeValue: source.lastModified || Date.now(),
      tags: [],
      snippet: content.slice(0, 240) || (extension ? `.${extension.toUpperCase()} file` : 'File'),
      summary: '',
      note: '',
      content,
      contentError,
      thumbnail,
    }
    files.value = [file, ...files.value.filter(item => item.path !== file.path)]
    refreshFolderCounts()
    saveBrowserState()
    return file
  }

  const importDroppedFiles = async (sources: File[], folderPath?: string) => {
    const added: LocalFile[] = []
    let skipped = 0
    const target = folderPath ?? folders.value.find(folder => folder.name === selectedFolder.value)?.path
    for (const source of sources) {
      try {
        if (isDesktop()) {
          const filePath = window.electron.getPathForFile(source)
          if (!filePath) { skipped++; continue }
          const importedPath = await window.electron.invoke('files:import-drop', { filePath, folderPath: target, maxFiles: maxFilesPerFolder.value })
          await loadIndex()
          const imported = files.value.find(file => file.path === importedPath)
          if (imported) added.push(imported); else skipped++
        } else {
          const folder = ensureFolder(target)
          const count = files.value.filter(file => file.path.startsWith(folder.path + '/')).length
          if (count >= maxFilesPerFolder.value) { skipped++; continue }
          added.push(await addBrowserFile(source, folder.path))
        }
      } catch { skipped++ }
    }
    if (searchQuery.value.trim()) await searchIndexedFiles(searchQuery.value)
    return { added, skipped }
  }

  const addOneFile = async (folderPath?: string) => {
    const folder = folderPath || folders.value.find(item => item.name === selectedFolder.value)?.path
    if (isDesktop()) {
      const result = await window.electron.invoke('files:choose-and-index-file', { folderPath: folder })
      if (result) await loadIndex()
      return result
    }
    const picker = (window as Window & { showOpenFilePicker?: (options?: { multiple?: boolean }) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker
    if (picker) {
      try {
        const [handle] = await picker({ multiple: false })
        if (!handle) return null
        const source = await handle.getFile()
        const file = await addBrowserFile(source, folder)
        return { folderPath: folder ?? file.path, indexedCount: 1, skippedCount: 0, limit: 1 }
      } catch (error: any) {
        if (error?.name === 'AbortError') return null
        throw error
      }
    }
    return new Promise<{ folderPath: string; indexedCount: number; skippedCount: number; limit: number } | null>((resolve, reject) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.onchange = async () => {
        const source = input.files?.[0]
        if (!source) {
          resolve(null)
          return
        }
        try {
          const file = await addBrowserFile(source, folder)
          resolve({ folderPath: folder ?? file.path, indexedCount: 1, skippedCount: 0, limit: 1 })
        } catch (error) {
          reject(error)
        }
      }
      input.click()
    })
  }

  const createBrowserFile = async (baseName: string, extension: string, content: string, folderPath?: string, saveCopy = true) => {
    const folder = ensureFolder(folderPath)
    const safeName = sanitizeFileName(baseName)
    const cleanExtension = extension.replace(/^\./, '').toLowerCase()
    const name = `${safeName}.${cleanExtension}`
    const body = content || defaultFileTemplate(cleanExtension, safeName)
    const type = creatableFileTypes.find(type => type.extension === cleanExtension)
    if (!type) throw new Error('Unsupported document format')
    const portablePath = (value: string) => value.replace(/\\/g, '/')
    if (files.value.filter(file => portablePath(file.path).startsWith(portablePath(folder.path) + '/')).length >= maxFilesPerFolder.value) throw new Error('Folder limit reached')
    if (files.value.some(file => portablePath(file.path) === portablePath(folder.path + '/' + name))) throw new Error('File already exists')
    const mime = type.mime
    const savePicker = (window as Window & { showSaveFilePicker?: (options: { suggestedName: string }) => Promise<FileSystemFileHandle> }).showSaveFilePicker
    let saveHandle: FileSystemFileHandle | undefined
    if (!isDesktop() && saveCopy && savePicker) {
      try { saveHandle = await savePicker({ suggestedName: name }) }
      catch (error: any) { if (error?.name === 'AbortError') return null; throw error }
    }
    const blob = await createDocumentBlob(cleanExtension, body, mime)

    if (isDesktop()) {
      const result = await window.electron.invoke('files:create-in-folder', {
        folderPath: folder.path,
        fileName: name,
        content: body,
        bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
      })
      await loadIndex()
      const normalizePath = (value: string) => value.replace(/\\/g, '/')
      const created = files.value.find(file => normalizePath(file.path) === normalizePath(folder.path + '/' + name))
      if (!created) throw new Error('Created file not found in index')
      created.content = body
      return created
    }

    if (saveHandle) {
      try {
        const writable = await saveHandle.createWritable()
        await writable.write(blob)
        await writable.close()
      } catch (error: any) {
        if (error?.name === 'AbortError') return null
        throw error
      }
    } else if (saveCopy) {
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = name
      anchor.click()
      URL.revokeObjectURL(url)
    }
    return addBrowserFile(new File([blob], name, { type: mime, lastModified: Date.now() }), folder.path, body)
  }

  const removeIndexedFolder = async (folderPath: string) => {
    if (isDesktop()) {
      await window.electron.invoke('folders:remove-from-index', folderPath)
      if (folders.value.find(folder => folder.path === folderPath)?.name === selectedFolder.value) selectedFolder.value = null
      await loadIndex()
      return
    }
    files.value = files.value.filter(file => file.path !== folderPath && !file.path.startsWith(`${folderPath}/`))
    folders.value = folders.value.filter(folder => folder.path !== folderPath)
    if (folders.value.find(folder => folder.path === folderPath)?.name === selectedFolder.value) selectedFolder.value = null
    if (activeFile.value && (activeFile.value.path === folderPath || activeFile.value.path.startsWith(`${folderPath}/`))) activeFile.value = null
    if (searchResults.value) {
      searchResults.value = searchResults.value.filter(file => file.path !== folderPath && !file.path.startsWith(`${folderPath}/`))
    }
    saveBrowserState()
  }

  const addTagToFile = async (fileId: number, rawTag: string) => {
    if (!isDesktop()) {
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
    if (!isDesktop()) {
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
    if (!isDesktop()) { updateBrowserFile(fileId, file => ({ ...file, note })); return }
    await window.electron.invoke('files:set-note', { fileId, note })
    const update = (file: LocalFile) => file.id === fileId ? { ...file, note } : file
    files.value = files.value.map(update); if (activeFile.value?.id === fileId) activeFile.value = update(activeFile.value)
  }

  const openIndexedFile = async (fileId: number) => {
    if (isDesktop()) {
      await window.electron.invoke('files:open', fileId)
      return
    }
    const file = files.value.find(item => item.id === fileId)
    if (!file) return
    const blob = await storeDocumentBlob(file.path) ?? new Blob([file.content || file.snippet || file.name], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener')
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
  }

  const showIndexedFileInFolder = async (fileId: number) => {
    if (isDesktop()) await window.electron.invoke('files:show-in-folder', fileId)
  }

  const deleteIndexedFile = async (fileId: number) => {
    if (isDesktop()) await window.electron.invoke('files:delete', { fileId })
    files.value = files.value.filter(file => file.id !== fileId)
    if (searchResults.value) searchResults.value = searchResults.value.filter(file => file.id !== fileId)
    if (activeFile.value?.id === fileId) activeFile.value = null
    if (isDesktop()) folders.value = await window.electron.invoke('files:folders')
    else {
      refreshFolderCounts()
      saveBrowserState()
    }
  }

  const deleteFileFromDisk = async (fileId: number, mode: 'trash' | 'permanent') => {
    if (!isDesktop()) return deleteIndexedFile(fileId)
    await window.electron.invoke('files:delete-from-disk', { fileId, mode }); await deleteIndexedFile(fileId)
  }

  const searchIndexedFiles = async (query: string) => {
    const request = ++searchRequestId
    if (!query.trim()) { searchResults.value = null; return }
    if (!isDesktop()) {
      const terms = query.toLocaleLowerCase().split(/\s+/).map(term => term.replace(/^#+/, '')).filter(Boolean)
      searchResults.value = files.value.filter(file => terms.every(term => [file.name, file.snippet, file.note, file.content ?? '', ...file.tags].join(' ').toLocaleLowerCase().includes(term)))
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
      return matchesType && matchesTag && (!selectedFolder.value || file.path === folderPath || file.path.startsWith(`${folderPath ?? selectedFolder.value}/`) || file.path.startsWith(folderPath ?? selectedFolder.value))
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
  const openCreateFileDialog = (folderPath?: string | null) => {
    fileDialogFolder.value = folderPath ?? folders.value.find(folder => folder.name === selectedFolder.value)?.path ?? folders.value[0]?.path ?? null
    isCreateFileOpen.value = true
  }

  return {
    importDroppedFiles, files, folders, searchQuery, selectedType, selectedTag, selectedFolder, sortBy, allTags, maxFilesPerFolder, activeFile, filteredFiles,
    selectFile, getFileTypeCount, loadIndex, addFolder, addBrowserFile, addOneFile, createBrowserFile, createVirtualFolder, removeIndexedFolder,
    addTagToFile, removeTagFromFile, updateFileNote, openIndexedFile, showIndexedFileInFolder, deleteIndexedFile, deleteFileFromDisk, searchIndexedFiles,
    fileDialogFolder, isCreateFileOpen, openCreateFileDialog,
  }
}
