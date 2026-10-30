<script setup lang="ts">
import type { DocumentScanStatus } from '../../src/types/documentScan'
import FileCard from '~/components/FileCard.vue'
import type { LocalFile } from '~/types/file'
import { isAuxiliaryFilePath, isHiddenPath } from '../../src/utils/fileVisibility'

const { files, activeFile, selectFile, loadIndex, addFolder, searchOsDocuments } = useFiles()
const { settings } = useSettings()
const { t } = useLanguage()
const { summarize } = useAi()
const rightTab = useState<'chat' | 'summary'>('ai-panel-tab', () => 'chat')
const openSummary = async (file: LocalFile) => {
  selectFile(file)
  rightTab.value = 'summary'
  await summarize(file)
}
const query = ref('')
const documentType = ref('all')
const fileView = computed({
  get: () => settings.value.fileView,
  set: value => { settings.value.fileView = value },
})
const results = ref<LocalFile[]>([])
const drives = ref<Array<{ path: string; label: string }>>([])
const drivePath = ref('')
const isDesktop = ref(false)
const isScanning = useState('documents-scanning', () => false)
const isStopping = useState('documents-scan-stopping', () => false)
const scanScope = ref<'drive' | 'folders'>('drive')
const scanFolders = ref<string[]>([])
let browserScan: AbortController | undefined
const resumableScan = ref<DocumentScanStatus | null>(null)
const scanProgress = ref<DocumentScanStatus | null>(null)
let progressTimer: ReturnType<typeof setInterval> | undefined
let statusVersion = 0, refreshingProgress = false
let lastProgress = ''
const refreshScanStatus = async (reload = false) => {
  if (!isDesktop.value) return
  const version = ++statusVersion
  try {
    const status = await window.electron.invoke('files:document-scan-status')
    if (!status || version !== statusVersion) return
    resumableScan.value = status.resumable ? status : null
    scanProgress.value = status.running ? status : null
    const signature = `${status.indexedCount}:${status.contentCount}`
    if (reload && signature !== lastProgress) { lastProgress = signature; await loadIndex() }
  } catch (cause) { console.error('Could not load scan progress:', cause) }
}
const stopProgressPolling = () => {
  if (progressTimer) clearInterval(progressTimer)
  progressTimer = undefined
}
const startProgressPolling = () => {
  stopProgressPolling()
  progressTimer = setInterval(async () => {
    if (refreshingProgress) return
    refreshingProgress = true
    try { await refreshScanStatus(true) } finally { refreshingProgress = false }
  }, 2000)
}
watch(drivePath, () => { scanFolders.value = [] })
const notice = ref('')
const error = ref('')
const currentPage = ref(1)
const extensions = ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'markdown', 'log', 'csv', 'tsv', 'xls', 'xlsx', 'ods', 'ppt', 'pptx', 'odp', 'html', 'htm', 'json', 'xml', 'yaml', 'yml']
const selectedExtensions = ref([...extensions])
const toggleScanExtension = (extension: string, checked: boolean) => {
  selectedExtensions.value = checked
    ? [...new Set([...selectedExtensions.value, extension])]
    : selectedExtensions.value.filter(value => value !== extension)
}
const groups: Record<string, string[]> = {
  word: ['pdf', 'doc', 'docx', 'odt', 'rtf'],
  text: ['txt', 'md', 'markdown', 'log', 'html', 'htm', 'json', 'xml', 'yaml', 'yml'],
  sheets: ['csv', 'tsv', 'xls', 'xlsx', 'ods'],
  slides: ['ppt', 'pptx', 'odp'],
}
const typeOptions = computed(() => [
  { value: 'all', label: t('documentTypeAll') },
  { value: 'word', label: t('documentTypeWord') },
  { value: 'text', label: t('documentTypeText') },
  { value: 'sheets', label: t('documentTypeSheets') },
  { value: 'slides', label: t('documentTypeSlides') },
])
const visibleFiles = computed(() => {
  const matchingIds = new Set(results.value.map(file => file.id))
  const source = query.value.trim() ? files.value.filter(file => matchingIds.has(file.id)) : files.value
  return source.filter(file => {
    if (isAuxiliaryFilePath(file.path) || (!settings.value.showSystemFiles && isHiddenPath(file.path))) return false
    const extension = file.extension.toLowerCase()
    return extensions.includes(extension) && (documentType.value === 'all' || groups[documentType.value]?.includes(extension))
  }).sort((a, b) => (b.mtimeValue ?? 0) - (a.mtimeValue ?? 0))
})
const pageSize = computed(() => Math.max(1, Number(settings.value.pageSize) || 50))
const pageCount = computed(() => Math.max(1, Math.ceil(visibleFiles.value.length / pageSize.value)))
const pagedFiles = computed(() => visibleFiles.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
let searchTimer: ReturnType<typeof setTimeout> | undefined
let searchVersion = 0
const search = async () => {
  const version = ++searchVersion
  try {
    const found = await searchOsDocuments(query.value)
    if (version === searchVersion) results.value = found
  } catch (cause) {
    if (version === searchVersion) error.value = t('documentsLoadError')
    console.error('Could not search documents:', cause)
  }
}
watch(query, () => {
  searchVersion++
  results.value = []
  error.value = ''
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { void search() }, 250)
})
watch([query, documentType], () => { currentPage.value = 1 })
watch(pageCount, count => { currentPage.value = Math.min(currentPage.value, count) })
watch(() => settings.value.showSystemFiles, () => { if (query.value.trim()) void search() })

const chooseScanFolders = async () => {
  if (isScanning.value || !drivePath.value) return
  error.value = ''
  try {
    const selected = await window.electron.invoke('files:choose-scan-folders', { drivePath: drivePath.value })
    if (selected) scanFolders.value = [...new Set([...scanFolders.value, ...selected])]
  } catch (cause) {
    console.error('Could not choose scan folders:', cause)
    error.value = t('scanFolderChooseError')
  }
}
const stopScan = async () => {
  if (!isScanning.value || isStopping.value) return
  isStopping.value = true
  browserScan?.abort()
  if (isDesktop.value) {
    try { await window.electron.invoke('files:stop-document-scan') }
    catch (cause) {
      console.error('Could not stop document scan:', cause)
      error.value = t('scanStopError')
      isStopping.value = false
    }
  }
}
const scan = async (resume = false) => {
  if (resume && resumableScan.value) {
    const saved = resumableScan.value
    drivePath.value = saved.drivePath
    await nextTick()
    selectedExtensions.value = [...saved.extensions]
    scanScope.value = saved.folderPaths ? 'folders' : 'drive'
    scanFolders.value = [...(saved.folderPaths ?? [])]
  }
  if (isScanning.value || !selectedExtensions.value.length || (isDesktop.value && (!drivePath.value || (scanScope.value === 'folders' && !scanFolders.value.length)))) return
  isScanning.value = true
  isStopping.value = false
  browserScan = new AbortController()
  error.value = ''
  notice.value = ''
  try {
    let result
    if (isDesktop.value) {
      await window.electron.invoke('files:set-system-visibility', settings.value.showSystemFiles)
      if (isStopping.value) { notice.value = t('scanStopped'); return }
      startProgressPolling()
      result = await window.electron.invoke('files:scan-os-documents', {
        resume,
        drivePath: drivePath.value,
        extensions: [...selectedExtensions.value],
        ...(scanScope.value === 'folders' ? { folderPaths: [...scanFolders.value] } : {}),
      })
      stopProgressPolling()
      await loadIndex()
      await refreshScanStatus()
    } else {
      result = await addFolder({ extensions: [...selectedExtensions.value], signal: browserScan.signal })
    }
    if (result) {
      const stopped = 'cancelled' in result && result.cancelled
      notice.value = `${stopped ? t('scanStopped') + ' ' : ''}${t('osDocumentsUpdated')} ${result.indexedCount}. ${t('scanDocumentsSkipped')} ${result.skippedCount}`
      if (query.value.trim()) await search()
    }
  } catch (cause) {
    console.error('Could not scan documents:', cause)
    error.value = t('folderIndexError')
  } finally {
    stopProgressPolling()
    if (isDesktop.value) await refreshScanStatus()
    browserScan = undefined
    isScanning.value = false
    isStopping.value = false
  }
}
onMounted(async () => {
  isDesktop.value = Boolean(window.electron)
  try {
    await loadIndex()
    if (isDesktop.value) {
      drives.value = await window.electron.invoke('files:list-scan-drives')
      drivePath.value = drives.value[0]?.path ?? ''
      await refreshScanStatus()
    }
  } catch (cause) {
    console.error('Could not load documents:', cause)
    error.value = t('documentsLoadError')
  }
})
onBeforeUnmount(() => {
  stopProgressPolling()
  statusVersion++
  void stopScan()
  if (searchTimer) clearTimeout(searchTimer)
  searchVersion++
})
</script>

<template>
  <section class="min-h-0 flex-1 overflow-y-auto p-5 md:p-7">
    <header class="mb-5">
      <h1 class="text-xl font-bold text-surface-900 dark:text-surface-100">{{ t('documentSearchTitle') }}</h1>
      <p class="mt-1 text-sm text-surface-500">{{ t(isDesktop ? 'documentSearchHint' : 'documentSearchBrowserHint') }}</p>
    </header>
    <div class="mb-5 space-y-3 rounded-xl border border-surface-200 p-4 text-xs dark:border-surface-700">
    <fieldset :disabled="isScanning" class="space-y-3">
      <label v-if="isDesktop" class="flex flex-wrap items-center gap-3">
        <span>{{ t('scanDriveLabel') }}</span>
        <AppDropdown v-model="drivePath" :options="drives.map(drive => ({ value: drive.path, label: drive.label }))" :disabled="isScanning" :aria-label="t('scanDriveLabel')" class="w-40 max-w-full" />
      </label>
      <div v-if="isDesktop" class="space-y-3">
        <label class="flex flex-wrap items-center gap-3">
          <span>{{ t('scanScopeLabel') }}</span>
          <AppDropdown v-model="scanScope" :disabled="isScanning" :options="[{ value: 'drive', label: t('scanScopeDrive') }, { value: 'folders', label: t('scanScopeFolders') }]" class="w-56 max-w-full" />
        </label>
        <template v-if="scanScope === 'folders'">
          <button type="button" :disabled="isScanning || !drivePath" class="rounded-lg border border-surface-200 px-3 py-2 disabled:opacity-40 dark:border-surface-700" @click="chooseScanFolders">{{ t('scanChooseFolders') }}</button>
          <ul v-if="scanFolders.length" class="max-h-36 space-y-2 overflow-y-auto">
            <li v-for="folder in scanFolders" :key="folder" class="flex items-start justify-between gap-2">
              <span class="break-all font-mono">{{ folder }}</span>
              <button type="button" :disabled="isScanning" class="shrink-0 rounded p-1 text-surface-500 hover:text-rose-500 disabled:opacity-40" :aria-label="`${t('scanRemoveFolder')}: ${folder}`" @click="scanFolders = scanFolders.filter(path => path !== folder)"><Icon name="lucide:x" size="14" /></button>
            </li>
          </ul>
        </template>
        <p class="text-surface-500">{{ t('scanPartsHint') }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <span>{{ t('scanExtensionsLabel') }}</span>
        <button type="button" class="text-primary-600 dark:text-primary-400" @click="selectedExtensions = [...extensions]">{{ t('selectAllExtensions') }}</button>
        <button type="button" class="text-surface-500" @click="selectedExtensions = []">{{ t('clearExtensionSelection') }}</button>
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-2">
        <UCheckbox v-for="extension in extensions" :key="extension" :model-value="selectedExtensions.includes(extension)"
          :label="extension.toUpperCase()" :aria-label="extension.toUpperCase()" :disabled="isScanning" size="sm"
          @update:model-value="checked => toggleScanExtension(extension, checked === true)" />
      </div>
      <p class="text-surface-500">{{ t('scanDurationNotice') }}</p>
    </fieldset>
    <div class="flex flex-wrap items-center gap-3">
      <button type="button" class="rounded-lg bg-primary-600 px-3 py-2 font-medium text-white disabled:opacity-40" :disabled="isScanning || !selectedExtensions.length || (isDesktop && (!drivePath || (scanScope === 'folders' && !scanFolders.length)))" @click="scan()">
        {{ t(isScanning ? 'scanDocumentsInProgress' : isDesktop ? (scanScope === 'folders' ? 'scanSelectedFolders' : 'rescanOsDocuments') : 'scanDocuments') }}
      </button>
      <button v-if="isDesktop && !isScanning && resumableScan" type="button" class="rounded-lg border border-primary-500/50 px-3 py-2 font-medium text-primary-600 dark:text-primary-400" @click="scan(true)">{{ t('scanResume') }}</button>
      <button v-if="isScanning" type="button" class="rounded-lg border border-rose-500/50 px-3 py-2 font-medium text-rose-600 disabled:opacity-50 dark:text-rose-400" :disabled="isStopping" @click="stopScan">
        {{ t(isStopping ? 'scanStopping' : 'scanStop') }}
      </button>
    </div>
    </div>
    <p v-if="isScanning && scanProgress" class="mb-3 text-xs text-surface-500" role="status">
      {{ t(scanProgress.phase === 'content' ? 'scanContentPhase' : 'scanMetadataPhase') }} · {{ t('scanFoundCount') }} {{ scanProgress.indexedCount }} · {{ t('scanContentCount') }} {{ scanProgress.contentCount }}
    </p>
    <p v-if="isDesktop && !isScanning && resumableScan" class="mb-3 text-xs text-surface-500">{{ t('scanSavedProgress') }} {{ resumableScan.drivePath }} · {{ t('scanFoundCount') }} {{ resumableScan.indexedCount }}</p>
    <p v-if="notice" class="mb-3 text-xs text-primary-600 dark:text-primary-400" role="status">{{ notice }}</p>
    <p v-if="error" class="mb-3 text-xs text-rose-500" role="alert">{{ error }}</p>
    <div class="mb-4 space-y-3">
      <input v-model="query" type="search" :aria-label="t('documentSearchPlaceholder')" :placeholder="t('documentSearchPlaceholder')" class="block w-full min-w-0 rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-sm outline-none focus:border-primary-500 dark:border-surface-700 dark:bg-surface-800">
      <div class="flex flex-wrap items-center justify-between gap-3">
      <AppDropdown v-model="documentType" :options="typeOptions" class="w-52 max-w-full" />
      <div class="inline-flex rounded-lg border border-surface-200 p-1 dark:border-surface-700" role="group" :aria-label="t('documentsPage')">
        <button v-for="view in (['list', 'grid'] as const)" :key="view" type="button"
          class="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors"
          :class="fileView === view ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400' : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800'"
          :aria-pressed="fileView === view" @click="fileView = view">
          <Icon :name="view === 'list' ? 'lucide:list' : 'lucide:layout-grid'" size="14" />
          {{ t(view === 'list' ? 'listView' : 'gridView') }}
        </button>
      </div>
    </div>
    </div>
    <div v-if="pagedFiles.length" :class="fileView === 'grid' ? 'grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3' : 'flex flex-col gap-3'">
      <FileCard v-for="file in pagedFiles" :key="file.id" :file="file" :layout="fileView" :active="activeFile?.id === file.id" @select="selectFile" @summary="openSummary" />
    </div>
    <div v-else class="flex min-h-48 flex-col items-center justify-center text-center">
      <Icon name="lucide:file-search" size="40" class="mb-3 text-surface-400" />
      <p class="font-semibold">{{ t('documentSearchEmpty') }}</p>
      <p class="mt-1 text-xs text-surface-500">{{ t('documentSearchEmptyHint') }}</p>
    </div>
    <footer v-if="visibleFiles.length" class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-surface-200 pt-3 text-xs text-surface-500 dark:border-surface-800">
      <span>{{ t('files') }}: {{ visibleFiles.length }}</span>
      <div class="flex items-center gap-2">
        <button type="button" class="rounded-lg border border-surface-200 px-3 py-1.5 disabled:opacity-40 dark:border-surface-700" :disabled="currentPage <= 1" @click="currentPage--">{{ t('previousPage') }}</button>
        <span>{{ currentPage }} / {{ pageCount }}</span>
        <button type="button" class="rounded-lg border border-surface-200 px-3 py-1.5 disabled:opacity-40 dark:border-surface-700" :disabled="currentPage >= pageCount" @click="currentPage++">{{ t('nextPage') }}</button>
      </div>
    </footer>
  </section>
</template>
