import { searchableTextExtensions } from '../../src/utils/fileTypeGroups'
import type { BrowserSearchRequest, BrowserSearchResponse } from '../workers/fileSearch.worker'
import type { WorkspaceTransferMode } from '../../src/types/workspace'
import { isAuxiliaryFilePath, isHiddenPath } from '../../src/utils/fileVisibility'
import { compareFileSizes } from '../utils/fileSizeSort'
import { imageFileExtensions, scriptFileExtensions } from '../utils/fileTypeGroups'
import type { IndexedFolder, LocalFile, ChatMessage } from '../types/file'
import { createDocumentBlob, extractDocumentText, removeDocumentBlob, storeDocumentBlob } from '../utils/documents'
import { creatableFileTypes, defaultFileTemplate } from './useFileTypes'
import { useLanguage } from './useLanguage'
import { useDocumentScanActivity } from './useDocumentScan'

interface IndexedFileRecord {
  id: number
  name: string
  path: string
  extension: string
  size: number
  mtime: number
  snippet: string
  contentMatch?: string
  tags: string[]
  note: string
  content?: string
}

const browserStorageKey = 'localmind-browser-files'
const browserFoldersKey = 'localmind-browser-folders'
const editableTextExtensions = new Set(['tsv', 'txt', 'md', 'markdown', 'csv', 'json', 'xml', 'html', 'htm', 'js', 'ts', 'vue', 'css', 'scss', 'yaml', 'yml', 'log', 'sql', 'py', 'java', 'c', 'cpp', 'h', 'sh'])
const defaultBrowserFolderPath = 'Browser/Workspace'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function toLocalFile(file: IndexedFileRecord, dateFormat: Intl.DateTimeFormat): LocalFile {
  return {
    id: file.id, name: file.name, path: file.path, extension: file.extension,
    size: formatFileSize(file.size), sizeBytes: file.size, mtime: Number.isFinite(file.mtime) ? dateFormat.format(file.mtime) : '', mtimeValue: file.mtime,
    tags: file.tags, snippet: file.snippet, contentMatch: file.contentMatch, summary: '', note: file.note ?? '', content: file.content,
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

const createFiles = () => {
  const { language } = useLanguage()
  const dateFormat = computed(() => new Intl.DateTimeFormat(language.value))
  const formatDate = (timestamp: number) => dateFormat.value.format(timestamp)
  const { settings } = useSettings()
  const excludedBySettings = (path: string) => !settings.value.showSystemFiles && isHiddenPath(path)
  const excludedFromUserLists = (path: string) => excludedBySettings(path) || isAuxiliaryFilePath(path)
  const excludedBrowserFiles = useState<LocalFile[]>('excluded-browser-files', () => [])
  const excludedBrowserFolders = useState<IndexedFolder[]>('excluded-browser-folders', () => [])
  const browserVisibilityMode = useState<boolean | null>('browser-system-file-visibility', () => null)
  const syncSystemFilesPreference = async () => {
    if (isDesktop()) await window.electron.invoke('files:set-system-visibility', settings.value.showSystemFiles)
  }
  const files = useState<LocalFile[]>('files', () => shallowRef<LocalFile[]>([]))
  const folders = useState<IndexedFolder[]>('indexed-folders', () => [])
  const searchResults = useState<LocalFile[] | null>('file-search-results', () => shallowRef<LocalFile[] | null>(null))
  const searchQuery = useState('search-query', () => '')
  const appliedSearchQuery = useState('applied-search-query', () => '')
  const searchLoading = useState('file-search-loading', () => false)
  const { isScanning: isScanningDocuments } = useDocumentScanActivity()
  const searchRequestId = useState('file-search-request-id', () => 0)
  const invalidateSearch = () => { searchRequestId.value++; searchLoading.value = false }
  const selectedType = useState<string | null>('selected-file-type', () => null)
  const selectedTag = useState<string | null>('selected-file-tag', () => null)
  const selectedFolder = useState<string | null>('selected-folder', () => null)
  const sortBy = useState('file-sort', () => 'relevance')
  const activeFile = useState<LocalFile | null>('active-file', () => null)
  const selectedFileIds = useState<number[]>('workspace-selected-file-ids', () => [])
  const filesById = computed(() => new Map(files.value.map(file => [file.id, file])))
  watch(files, () => {
    if (!selectedFileIds.value.length) return
    const valid = selectedFileIds.value.filter(id => filesById.value.has(id))
    if (valid.length !== selectedFileIds.value.length) selectedFileIds.value = valid
  })
  const selectedFiles = computed(() => {
    if (!selectedFileIds.value.length) return []
    const ids = new Set(selectedFileIds.value)
    return files.value.filter(file => ids.has(file.id))
  })
  const showFilePreview = useState('show-file-preview', () => false)
  const maxFilesPerFolder = useState('max-files-per-folder', () => 1000)
  const browserFilesLoaded = useState('browser-files-loaded', () => false)
  const fileDialogFolder = useState<string | null>('file-dialog-folder', () => null)
  const isCreateFileOpen = useState('create-file-open', () => false)
  const fileTransferRequest = useState<{fileIds:number[];mode:WorkspaceTransferMode;targetFolderPath?:string} | null>('file-transfer-request', () => null)
  const openFileTransfer = (fileIds: number[], mode: WorkspaceTransferMode, targetFolderPath?: string) => {
    if (!isDesktop()) return
    const ids = [...new Set(fileIds)].filter(id => filesById.value.has(id))
    if (ids.length) fileTransferRequest.value = {fileIds:ids,mode,targetFolderPath}
  }
  const createWorkspaceFolder = async (parentPath: string, name: string) => {
    const folder = await window.electron.invoke('folders:create', {parentPath,name})
    await loadIndex()
    return folder
  }
  const transferWorkspaceFiles = async (fileIds: number[], targetFolderPath: string, mode: WorkspaceTransferMode) => {
    const result = await window.electron.invoke('files:transfer-workspace', {fileIds,targetFolderPath,mode,maxFiles:maxFilesPerFolder.value})
    if (mode === 'move') {
      const moves = new Map(result.completed.map(file => [file.sourceId,file]))
      const conversations = useState<Record<string,ChatMessage[]>>('ai-conversations', () => ({}))
      for (const messages of Object.values(conversations.value)) for (const message of messages) {
        for (const reference of [...(message.attachments ?? []),...(message.createdFiles ?? []),...(message.editedFiles ?? [])]) {
          const moved = moves.get(reference.id)
          if (moved && (!reference.path || reference.path === moved.oldPath)) { reference.path=moved.path; reference.name=moved.name }
        }
      }
      const sessions = useState<Record<string,{paths:string[];createdAt:number;title?:string}>>('ai-chat-sessions', () => ({}))
      const paths = new Map(result.completed.map(file => [file.oldPath,file.path]))
      for (const session of Object.values(sessions.value)) session.paths = session.paths.map(value => paths.get(value) ?? value)
      if (activeFile.value) {
        const moved = moves.get(activeFile.value.id)
        if (moved) activeFile.value = {...activeFile.value,path:moved.path,name:moved.name}
      }
      selectedFileIds.value = selectedFileIds.value.filter(id => !moves.has(id))
    }
    await loadIndex()
    if (searchQuery.value.trim()) await searchIndexedFiles(searchQuery.value)
    return result
  }

  watch(language, () => {
    const localize = (file: LocalFile) => file.mtimeValue ? { ...file, mtime: dateFormat.value.format(file.mtimeValue) } : file
    files.value = files.value.map(localize)
    if (searchResults.value) searchResults.value = searchResults.value.map(localize)
    if (activeFile.value) activeFile.value = localize(activeFile.value)
  })

  const saveBrowserState = () => {
    if (!import.meta.client || isDesktop()) return
    localStorage.setItem(browserStorageKey, JSON.stringify([...files.value, ...excludedBrowserFiles.value]))
    localStorage.setItem(browserFoldersKey, JSON.stringify([...folders.value, ...excludedBrowserFolders.value].map(({ name, path }) => ({ name, path }))))
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
      const selected = folders.value.find(folder => (folder.path === selectedFolder.value || folder.name === selectedFolder.value))
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

  if (import.meta.client) {
    const savedLimit = Number(localStorage.getItem('max-files-per-folder'))
    if ([100, 500, 1000, 2500, 5000].includes(savedLimit)) maxFilesPerFolder.value = savedLimit
  }
  watch(maxFilesPerFolder, limit => { if (import.meta.client) localStorage.setItem('max-files-per-folder', String(limit)) })

  const indexLoading = useState('file-index-loading', () => true)
  let indexReady = false
  let indexLoad: Promise<void> | undefined
  let indexRevision = 0
  const ensureIndex = () => indexLoad ?? (indexReady ? Promise.resolve() : loadIndex())
  const loadIndex = (): Promise<void> => {
    const revision = ++indexRevision
    if (!indexReady) indexLoading.value = true
    const task = readIndex(revision).then(() => {
      if (revision !== indexRevision) return indexLoad
      indexReady = true
    }).finally(() => {
      if (revision === indexRevision) {
        indexLoading.value = false
        indexLoad = undefined
      }
    })
    indexLoad = task
    return task
  }

  const readIndex = async (revision: number) => {
    if (!isDesktop()) {
      if (browserFilesLoaded.value && browserVisibilityMode.value === settings.value.showSystemFiles) return
      try {
        const storedFiles = JSON.parse(localStorage.getItem(browserStorageKey) ?? '[]')
        const allFiles: LocalFile[] = Array.isArray(storedFiles) ? storedFiles : []
        excludedBrowserFiles.value = allFiles.filter(file => excludedBySettings(file.path))
        files.value = allFiles.filter(file => !excludedBySettings(file.path))
        const storedFolders = JSON.parse(localStorage.getItem(browserFoldersKey) ?? '[]') as Array<{ name: string; path: string }>
        folders.value = Array.isArray(storedFolders)
          ? storedFolders.filter(folder => !excludedBySettings(folder.path)).map(folder => ({ ...folder, count: 0 }))
          : []
        excludedBrowserFolders.value = Array.isArray(storedFolders) ? storedFolders.filter(folder => excludedBySettings(folder.path)).map(folder => ({ ...folder, count: 0 })) : []
        if (!folders.value.length && files.value.length) {
          folders.value = [{ name: 'Workspace', path: defaultBrowserFolderPath, count: 0 }]
        }
        refreshFolderCounts()
      } catch {
        files.value = []
        folders.value = []
      }
      browserFilesLoaded.value = true
      browserVisibilityMode.value = settings.value.showSystemFiles
      if (activeFile.value) activeFile.value = files.value.find(file => file.id === activeFile.value?.id) ?? null
      if (selectedFolder.value && !folders.value.some(folder => (folder.path === selectedFolder.value || folder.name === selectedFolder.value))) selectedFolder.value = null
      return
    }
    await syncSystemFilesPreference()
    const [records, indexedFolders] = await Promise.all([window.electron.invoke('files:list'), window.electron.invoke('files:folders')])
    const next: LocalFile[] = []
    const formatter = dateFormat.value
    let frameStart = performance.now()
    for (let i = 0; i < records.length; i++) {
      const record = records[i]!
      next.push(toLocalFile(record, formatter))
      if (i % 128 === 127 && performance.now() - frameStart >= 6) {
        await new Promise(resolve => setTimeout(resolve, 0))
        if (revision !== indexRevision) return
        frameStart = performance.now()
      }
    }
    if (revision !== indexRevision) return
    files.value = formatter === dateFormat.value ? next : next.map(file => ({
      ...file, mtime: file.mtimeValue === undefined ? file.mtime : dateFormat.value.format(file.mtimeValue),
    }))
    folders.value = indexedFolders
    if (selectedFolder.value && !folders.value.some(folder => (folder.path === selectedFolder.value || folder.name === selectedFolder.value))) selectedFolder.value = null
    if (activeFile.value) activeFile.value = files.value.find(file => file.path === activeFile.value?.path) ?? null
  }

  const addDroppedFolders = async (paths: string[]) => {
    await syncSystemFilesPreference()
    const result = await window.electron.invoke('folders:index-drop', { paths, maxFiles: maxFilesPerFolder.value })
    if (result.added || result.unavailable) await loadIndex()
    return result
  }

  const addFolder = async (options: { extensions?: string[]; signal?: AbortSignal } = {}) => {
    if (isDesktop()) {
      await syncSystemFilesPreference()
      const result = await window.electron.invoke('files:choose-and-index', { maxFiles: maxFilesPerFolder.value })
      if (result) await loadIndex()
      return result
    }

    const picker = (window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker
    if (picker) {
      try {
        const directory = await picker()
        if (options.signal?.aborted) return { folderPath: '', indexedCount: 0, skippedCount: 0, limit: maxFilesPerFolder.value, cancelled: true }
        if (excludedBySettings(directory.name)) return { folderPath: '', indexedCount: 0, skippedCount: 1, limit: maxFilesPerFolder.value }
        const folder = createVirtualFolder(directory.name)
        let indexedCount = 0
        let skippedCount = 0
        const isUnavailable = (error: unknown) => error instanceof DOMException &&
          ['NotAllowedError', 'SecurityError', 'NotReadableError', 'NotFoundError'].includes(error.name)
        const visit = async (handle: FileSystemDirectoryHandle, prefix: string) => {
          try {
            for await (const [name, entry] of (handle as FileSystemDirectoryHandle & { entries(): AsyncIterableIterator<[string, FileSystemHandle]> }).entries()) {
              if (options.signal?.aborted) return
              if (excludedBySettings(name) || indexedCount >= maxFilesPerFolder.value) { skippedCount++; continue }
              if (entry.kind === 'directory') {
                await visit(entry as FileSystemDirectoryHandle, prefix + '/' + name)
                continue
              }
              const extension = name.includes('.') ? name.split('.').pop()?.toLowerCase() ?? '' : ''
              if (options.extensions?.length && !options.extensions.includes(extension)) continue
              let source: File
              try { source = await (entry as FileSystemFileHandle).getFile() }
              catch (error) {
                if (!isUnavailable(error)) throw error
                skippedCount++
                continue
              }
              if (options.signal?.aborted) return
              await addBrowserFile(source, prefix, undefined, false)
              indexedCount++
              if (indexedCount % 16 === 0) {
                refreshFolderCounts()
                saveBrowserState()
                await new Promise(resolve => setTimeout(resolve, 0))
              }
            }
          } catch (error) {
            if (!isUnavailable(error)) throw error
            if (!options.signal?.aborted) skippedCount++
          }
        }
        try { await visit(directory, folder.path) }
        finally {
          refreshFolderCounts()
          saveBrowserState()
        }
        return { folderPath: folder.path, indexedCount, skippedCount, limit: maxFilesPerFolder.value, cancelled: options.signal?.aborted ?? false }
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

  const addBrowserFile = async (source: File, folderPath?: string, indexedText?: string, persist = true) => {
    if (excludedBySettings(source.webkitRelativePath || source.name) || (folderPath && excludedBySettings(folderPath))) throw new Error('Hidden files cannot be indexed')
    const known = folderPath ? folders.value.find(folder => folder.path === folderPath || folder.name === folderPath) : undefined
    const targetPath = known?.path ?? folderPath ?? ensureFolder().path
    const extension = source.name.includes('.') ? source.name.split('.').pop()?.toLowerCase() ?? '' : ''
    let content = indexedText ?? '', contentError = ''
    if (indexedText === undefined && ['pdf', 'docx', 'odt'].includes(extension)) {
      try { content = await extractDocumentText(source); if (!content.trim()) contentError = 'No extractable text (scanned or empty document)' }
      catch (error) { contentError = error instanceof Error ? error.message : String(error) }
    } else if (indexedText === undefined && (source.type.startsWith('text/') || searchableTextExtensions.has(extension))) content = (await source.text()).slice(0, 120000)
    await storeDocumentBlob(targetPath + '/' + source.name, source)
    const thumbnail = await createImageThumbnail(source)
    const file: LocalFile = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      name: source.name,
      path: `${targetPath}/${source.name}`,
      extension,
      size: formatFileSize(source.size),
      sizeBytes: source.size,
      mtime: formatDate(source.lastModified || Date.now()),
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
    if (persist) {
      refreshFolderCounts()
      saveBrowserState()
    }
    return file
  }

  const importDroppedFiles = async (sources: File[], folderPath?: string) => {
    await syncSystemFilesPreference()
    const added: LocalFile[] = []
    let skipped = 0
    const target = folderPath ?? folders.value.find(folder => (folder.path === selectedFolder.value || folder.name === selectedFolder.value))?.path
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
    const folder = folderPath || folders.value.find(item => (item.path === selectedFolder.value || item.name === selectedFolder.value))?.path
    if (isDesktop()) {
      await syncSystemFilesPreference()
      const result = await window.electron.invoke('files:choose-and-index-file', { folderPath: folder, maxFiles: maxFilesPerFolder.value })
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

  const createBrowserFile = async (baseName: string, extension: string, content: string, folderPath?: string, saveCopy = true, writeAllowed?: () => boolean) => {
    if (folderPath && !folders.value.some(folder => folder.path === folderPath)) throw new Error('Workspace not found')
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
    if (writeAllowed && !writeAllowed()) throw new Error('File creation permission was revoked')

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

  const saveGeneratedMedia = async (blob: Blob, baseName: string, folderPath: string): Promise<LocalFile> => {
    const folder = folders.value.find(folder => folder.path === folderPath)
    if (!folder) throw new Error('Workspace not found')
    if (!blob.size || blob.size > 30 * 1024 * 1024) throw new Error('Invalid generated image size')
    const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer())
    const ascii = (start: number, end: number) => String.fromCharCode(...head.slice(start, end))
    const extension = head[0] === 0x89 && ascii(1, 4) === 'PNG' ? 'png' : head[0] === 0xff && head[1] === 0xd8 ? 'jpg' : ascii(0, 3) === 'GIF' ? 'gif' : ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP' ? 'webp' : ascii(0, 2) === 'BM' ? 'bmp' : ascii(4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(8, 12)) ? 'avif' : ''
    if (!extension) throw new Error('The workflow output is not a supported raster image')
    const name = sanitizeFileName(baseName) + '.' + extension
    const portable = (value: string) => value.replace(/\\/g, '/')
    if (files.value.filter(file => portable(file.path).startsWith(portable(folder.path) + '/')).length >= maxFilesPerFolder.value) throw new Error('Folder limit reached')
    if (files.value.some(file => portable(file.path) === portable(folder.path + '/' + name))) throw new Error('File already exists')
    if (isDesktop()) {
      await window.electron.invoke('files:create-in-folder', { folderPath: folder.path, fileName: name, content: '', bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) })
      await loadIndex()
      const saved = files.value.find(file => portable(file.path) === portable(folder.path + '/' + name))
      if (!saved) throw new Error('Generated file not found in index')
      return saved
    }
    const mime = extension === 'jpg' ? 'image/jpeg' : 'image/' + extension
    return addBrowserFile(new File([blob], name, { type: mime, lastModified: Date.now() }), folder.path, '')
  }

  const editIndexedFile = async (fileId: number, content: string, expectedMtime: number, isAllowed: () => boolean) => {
    if (!isAllowed()) throw new Error('File editing permission was revoked')
    const current = files.value.find(file => file.id === fileId)
    if (!current || isHiddenPath(current.path)) throw new Error('Selected file is no longer available')
    if (typeof content !== 'string' || content.length > 2000000) throw new Error('Invalid document edit')
    if ((current.mtimeValue ?? 0) !== expectedMtime) throw new Error('File changed while the model was responding')
    const type = creatableFileTypes.find(type => type.extension === current.extension)
    if (!type && !editableTextExtensions.has(current.extension)) throw new Error('This file format cannot be edited')
    const blob = await createDocumentBlob(current.extension, content, type?.mime ?? 'text/plain;charset=utf-8')
    if (!isAllowed()) throw new Error('File editing permission was revoked')
    if (isDesktop()) {
      await window.electron.invoke('files:edit-content', { fileId, content, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())), expectedMtime })
      await loadIndex()
      const updated = files.value.find(file => file.id === fileId)
      if (updated) { updated.content = content; updated.summary = ''; updated.contentError = undefined }
    } else {
      // Browser imports are project copies. No disk access is requested or implied.
      await storeDocumentBlob(current.path, blob)
      const mtimeValue = Date.now()
      updateBrowserFile(fileId, file => ({ ...file, content, snippet: content.slice(0, 240), summary: '', contentError: undefined, size: formatFileSize(blob.size), sizeBytes: blob.size, mtimeValue, mtime: formatDate(mtimeValue) }))
    }
    if (searchQuery.value.trim()) await searchIndexedFiles(searchQuery.value)
    return files.value.find(file => file.id === fileId)!
  }

  const removeIndexedFolder = async (folderPath: string) => {
    if (isDesktop()) {
      await window.electron.invoke('folders:remove-from-index', folderPath)
      if (selectedFolder.value === folderPath || folders.value.find(folder => folder.path === folderPath)?.name === selectedFolder.value) selectedFolder.value = null
      await loadIndex()
      return
    }
    files.value = files.value.filter(file => file.path !== folderPath && !file.path.startsWith(`${folderPath}/`))
    excludedBrowserFiles.value = excludedBrowserFiles.value.filter(file => file.path !== folderPath && !file.path.startsWith(`${folderPath}/`))
    excludedBrowserFolders.value = excludedBrowserFolders.value.filter(folder => folder.path !== folderPath && !folder.path.startsWith(`${folderPath}/`))
    folders.value = folders.value.filter(folder => folder.path !== folderPath)
    if (selectedFolder.value === folderPath || folders.value.find(folder => folder.path === folderPath)?.name === selectedFolder.value) selectedFolder.value = null
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

  const getIndexedFileBlob = async (fileId: number): Promise<Blob> => {
    const file = files.value.find(item => item.id === fileId)
    if (!file) throw new Error('File is no longer available in this workspace')
    const type = creatableFileTypes.find(type => type.extension === file.extension)
    const imageTypes: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif', svg: 'image/svg+xml', ico: 'image/x-icon', tif: 'image/tiff', tiff: 'image/tiff' }
    const mime = imageTypes[file.extension] ?? type?.mime ?? 'application/octet-stream'
    if (isDesktop()) {
      const bytes = await window.electron.invoke('files:get-bytes', fileId)
      return new Blob([new Uint8Array(bytes)], { type: mime })
    }
    const stored = await storeDocumentBlob(file.path)
    if (stored) return stored
    if (file.content !== undefined && (type || editableTextExtensions.has(file.extension))) {
      return createDocumentBlob(file.extension, file.content, type?.mime ?? 'text/plain;charset=utf-8')
    }
    throw new Error('Original file is not stored. Import the file again to enable downloads.')
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

  const renameIndexedFile = async (fileId: number, requestedName: string) => {
    const current = files.value.find(file => file.id === fileId)
    if (!current) throw new Error('File is no longer available')
    const entered = requestedName.trim()
    if (!entered || entered.length > 180 || /[\\/:*?"<>|\x00-\x1f]/.test(entered)) throw new Error('Invalid file name')
    const suffix = current.extension ? '.' + current.extension : ''
    const nextName = /\.[^.]+$/.test(entered) ? entered : entered + suffix
    if (current.extension && nextName.split('.').pop()?.toLowerCase() !== current.extension.toLowerCase()) throw new Error('Changing the file extension is not supported')
    const nextPath = current.path.slice(0, current.path.length - current.name.length) + nextName
    if (files.value.some(file => file.id !== fileId && file.path.toLowerCase() === nextPath.toLowerCase())) throw new Error('A file with that name already exists')
    if (isDesktop()) {
      await window.electron.invoke('files:rename', { fileId, name: entered })
      await loadIndex()
      const updated = files.value.find(file => file.id === fileId)
      if (updated) activeFile.value = updated
      if (searchQuery.value.trim()) await searchIndexedFiles(searchQuery.value)
      return updated
    }
    const blob = await storeDocumentBlob(current.path)
    if (blob) { await storeDocumentBlob(nextPath, blob); await removeDocumentBlob(current.path) }
    const mtimeValue = Date.now()
    const update = (file: LocalFile): LocalFile => file.id === fileId ? { ...file, name: nextName, path: nextPath, mtimeValue, mtime: formatDate(mtimeValue) } : file
    files.value = files.value.map(update)
    if (searchResults.value) searchResults.value = searchResults.value.map(update)
    if (activeFile.value?.id === fileId) activeFile.value = update(activeFile.value)
    saveBrowserState()
    return files.value.find(file => file.id === fileId)
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

  let searchWorker: Worker | undefined
  let workerFiles: LocalFile[] | undefined
  let workerRequest = 0
  let workerUnavailable = false
  const workerReplies = new Map<number, (ids?: number[]) => void>()
  const disableSearchWorker = () => {
    workerUnavailable = true
    searchWorker?.terminate()
    searchWorker = undefined
    workerFiles = undefined
    for (const resolve of workerReplies.values()) resolve()
    workerReplies.clear()
  }

  async function searchBrowserFiles(query: string): Promise<LocalFile[]> {
    while (!workerUnavailable && typeof Worker !== 'undefined') {
      const snapshot = files.value
      if (!searchWorker) {
        try {
          searchWorker = new Worker(new URL('../workers/fileSearch.worker.ts', import.meta.url), { type: 'module' })
          searchWorker.onmessage = ({ data }: MessageEvent<BrowserSearchResponse>) => {
            if (!data.ids) { disableSearchWorker(); return }
            workerReplies.get(data.id)?.(data.ids)
            workerReplies.delete(data.id)
          }
          searchWorker.onerror = disableSearchWorker
        } catch { disableSearchWorker(); break }
      }
      const id = ++workerRequest
      const request: BrowserSearchRequest = { id, query }
      if (workerFiles !== snapshot) {
        request.files = snapshot.map(({ id, name, content, snippet, note, tags }) =>
          ({ id, name, content, snippet, note, tags: toRaw(tags) }),
        )
        workerFiles = snapshot
      }
      const ids = await new Promise<number[] | undefined>(resolve => {
        workerReplies.set(id, resolve)
        try { searchWorker!.postMessage(request) }
        catch { disableSearchWorker() }
      })
      if (!ids) break
      if (snapshot === files.value) return ids.flatMap(id => filesById.value.get(id) ?? [])
    }

    // Retain browser search if the host prevents Web Workers from starting.
    const { BrowserSearch } = await import('../../src/services/browserSearch')
    return new BrowserSearch(files.value).search(query)
  }

  const resetSearchFiltersAndSelection = () => {
    selectedType.value = null
    selectedTag.value = null
    selectedFileIds.value = []
    activeFile.value = null
  }

  const searchIndexedFiles = async (query: string) => {
    const request = ++searchRequestId.value
    const submitted = query.trim()
    if (!submitted) {
      searchResults.value = null
      appliedSearchQuery.value = ''
      searchLoading.value = false
      return
    }
    if (isScanningDocuments.value) return
    searchLoading.value = true
    try {
      const results = !isDesktop()
        ? await searchBrowserFiles(submitted)
        : (await window.electron.invoke('files:search', submitted)).map(record => toLocalFile(record, dateFormat.value))
      // Draft changes invalidate replies immediately, even before the next debounce expires.
      if (isScanningDocuments.value || request !== searchRequestId.value || submitted !== searchQuery.value.trim()) return
      searchResults.value = results
      appliedSearchQuery.value = submitted
    } finally { if (request === searchRequestId.value) searchLoading.value = false }
  }

  const selectCatalogScope = (folderPath: string | null) => {
    selectedFolder.value = folderPath
    searchQuery.value = ''
    void searchIndexedFiles('')
    resetSearchFiltersAndSelection()
  }

  const searchAllIndexedFiles = async (query: string): Promise<LocalFile[]> => {
    let results: LocalFile[]
    if (!query.trim()) results = files.value
    else if (!isDesktop()) {
      results = await searchBrowserFiles(query)
    } else {
      const records = await window.electron.invoke('files:search', query)
      results = records.map(record => toLocalFile(record, dateFormat.value))
    }
    return results.filter(file => !excludedFromUserLists(file.path))
  }

  const searchOsDocuments = async (query: string, isCurrent: () => boolean = () => true): Promise<LocalFile[]> => {
    if (!isDesktop()) return searchAllIndexedFiles(query)
    const records = query.trim()
      ? await window.electron.invoke('files:search-documents', query)
      : await window.electron.invoke('files:list')
    if (!isCurrent()) return []
    const matches = records.map(record => toLocalFile(record, dateFormat.value))
    // A scan can add a match before the latest catalog refresh reaches the renderer.
    const missing = matches.filter(file => !filesById.value.has(file.id))
    if (missing.length) files.value = [...files.value, ...missing]
    return matches.filter(file => !excludedFromUserLists(file.path))
  }

  const normalizePath = (value: string) => {
    const normalized = value.replace(/\\/g, '/').replace(/\/$/, '')
    return isDesktop() && window.electron.platform === 'win32' ? normalized.toLowerCase() : normalized
  }
  const selectedRoot = computed(() => normalizePath(folders.value.find(folder =>
    folder.path === selectedFolder.value || folder.name === selectedFolder.value,
  )?.path ?? selectedFolder.value ?? ''))
  const matchesSelectedFolder = (filePath: string) => {
    const root = selectedRoot.value
    if (!root) return true
    const normalized = normalizePath(filePath)
    return normalized === root || normalized.startsWith(root + '/')
  }

  const filteredFiles = computed(() => {
    const source = appliedSearchQuery.value && searchResults.value !== null ? searchResults.value : files.value
    return source.filter(file => {
      if (excludedFromUserLists(file.path)) return false
      const extension = file.extension.toLowerCase()
      const matchesType = !selectedType.value
        || (selectedType.value === '__scripts__' ? scriptFileExtensions.has(extension)
          : selectedType.value === '__images__' ? imageFileExtensions.has(extension)
            : extension === selectedType.value.toLowerCase())
      const matchesTag = !selectedTag.value || file.tags.includes(selectedTag.value)
      return matchesType && matchesTag && matchesSelectedFolder(file.path)
    }).sort((a, b) => {
      if (sortBy.value === 'size-asc' || sortBy.value === 'size-desc') return compareFileSizes(a, b, sortBy.value === 'size-desc')
      if (sortBy.value === 'date') return (b.mtimeValue ?? 0) - (a.mtimeValue ?? 0)
      if (sortBy.value === 'name') return a.name.localeCompare(b.name)
      if (sortBy.value === 'tag') return (a.tags[0] ?? '').localeCompare(b.tags[0] ?? '') || a.name.localeCompare(b.name)
      if (sortBy.value === 'type') return a.extension.localeCompare(b.extension) || a.name.localeCompare(b.name)
      return 0
    })
  })
  const allTags = computed(() => [...new Set(files.value.filter(file => !excludedFromUserLists(file.path)).flatMap(file => file.tags))].sort((a, b) => a.localeCompare(b)))
  const selectFile = (file: LocalFile) => { activeFile.value = file; showFilePreview.value = true }
  const getFileTypeCount = (extension: string) => files.value.filter(file => file.extension === extension).length
  const openCreateFileDialog = (folderPath?: string | null) => {
    fileDialogFolder.value = folderPath ?? folders.value.find(folder => (folder.path === selectedFolder.value || folder.name === selectedFolder.value))?.path ?? folders.value[0]?.path ?? null
    isCreateFileOpen.value = true
  }

  return {
    fileTransferRequest, openFileTransfer, createWorkspaceFolder, transferWorkspaceFiles, importDroppedFiles, files, folders, searchQuery, appliedSearchQuery, searchLoading, invalidateSearch, selectedType, selectedTag, selectedFolder, sortBy, allTags, maxFilesPerFolder, activeFile, selectedFileIds, selectedFiles, filteredFiles,
    selectFile, getFileTypeCount, loadIndex, ensureIndex, indexLoading, matchesSelectedFolder, selectCatalogScope, filesById, addFolder, addDroppedFolders, addBrowserFile, addOneFile, createBrowserFile, saveGeneratedMedia, editIndexedFile, createVirtualFolder, removeIndexedFolder,
    addTagToFile, removeTagFromFile, updateFileNote, getIndexedFileBlob, openIndexedFile, showIndexedFileInFolder, renameIndexedFile, deleteIndexedFile, deleteFileFromDisk, resetSearchFiltersAndSelection, searchIndexedFiles, searchAllIndexedFiles, searchOsDocuments,
    fileDialogFolder, isCreateFileOpen, openCreateFileDialog,
  }
}

// A single set of file computations and watchers serves the persistent shell and its pages.
const fileStores = new WeakMap<object, ReturnType<typeof createFiles>>()
export function useFiles() {
  const app = useNuxtApp()
  let store = fileStores.get(app)
  if (!store) {
    store = effectScope(true).run(createFiles)!
    fileStores.set(app, store)
  }
  return store
}
