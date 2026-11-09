<script setup lang="ts">
import FileCard from '~/components/FileCard.vue'
import { compactFilePageSize } from '~/utils/fileViews'
import { compareFileSizes, fileSizeSortOptions } from '~/utils/fileSizeSort'
import type { LocalFile } from '~/types/file'
import type { LanguageKey } from '~/composables/useLanguage'
import { getScanErrorKey } from '~/utils/scanMessages'
import { documentPageSizes } from '~/composables/useSettings'
import { baseDocumentScanExtensions, documentScanGroups, searchableFileExtensions } from '../../src/utils/fileTypeGroups'
import { isAuxiliaryFilePath, isHiddenPath } from '../../src/utils/fileVisibility'

const { files, filesById, activeFile, selectFile, ensureIndex, resetSearchFiltersAndSelection, searchOsDocuments } = useFiles()
const { settings } = useSettings()
const { t, formatNumber } = useLanguage()
const { summarize } = useAi()
const rightTab = useState<'chat' | 'summary'>('ai-panel-tab', () => 'chat')
const openSummary = async (file: LocalFile) => {
  selectFile(file)
  rightTab.value = 'summary'
  await summarize(file)
}
const query = useState('documents-search-query', () => '')
const appliedQuery = ref('')
const searchLoading = useState('documents-search-loading', () => false)
let pageActive = true
const sortBy = ref<'relevance' | 'size-asc' | 'size-desc'>('relevance')
const documentSortOptions = computed(() => ([{ value: 'relevance', label: 'sortRelevance' }, ...fileSizeSortOptions] as const)
  .map(option => ({ value: option.value, label: t(option.label) })))
const documentType = ref<'all' | keyof typeof documentScanGroups>('all')
const fileView = computed({
  get: () => settings.value.fileView,
  set: value => { settings.value.fileView = value },
})
const results = ref<LocalFile[]>([])
const drives = ref<Array<{ path: string; label: string }>>([])
const drivePath = useState('documents-scan-drive', () => '')
const additionalDrivePaths = useState<string[]>('documents-additional-drives', () => [])
const additionalDrives = computed(() => drives.value.filter(drive => drive.path !== drivePath.value))
const toggleAdditionalDrive = (path: string, checked: boolean) => {
  additionalDrivePaths.value = checked
    ? [...new Set([...additionalDrivePaths.value, path])]
    : additionalDrivePaths.value.filter(drive => drive !== path)
}
const isDesktop = ref(false)
const { isScanning, isStopping, resumableScan, scanProgress, completedScanCount, notice, error: scanError, startScan, stopScan, refreshScanStatus } = useDocumentScan()
const browseIndex = ref(false)
const showIndexedFiles = computed(() => browseIndex.value || completedScanCount.value > 0)
const catalogBeforeScan = shallowRef<LocalFile[]>([])
const catalog = computed(() => isScanning.value ? catalogBeforeScan.value : files.value)
const scanScope = useState<'drive' | 'folders'>('documents-scan-scope', () => 'drive')
const scanFolders = useState<string[]>('documents-scan-folders', () => [])
watch(drivePath, path => {
  scanFolders.value = []
  additionalDrivePaths.value = additionalDrivePaths.value.filter(drive => drive !== path)
})
const error = ref<LanguageKey | null>(null)
const currentPage = ref(1)
const extensions = [...searchableFileExtensions]
const selectedExtensions = useState('documents-scan-extensions', () => [...extensions])
const additionalScanGroups = [
  { id: 'code', label: 'scriptFiles', extensions: documentScanGroups.code.filter(extension => !baseDocumentScanExtensions.includes(extension)) },
  { id: 'images', label: 'imageFiles', extensions: documentScanGroups.images },
] as const
const toggleScanExtension = (extension: string, checked: boolean) => {
  selectedExtensions.value = checked
    ? [...new Set([...selectedExtensions.value, extension])]
    : selectedExtensions.value.filter(value => value !== extension)
}
const typeOptions = computed(() => [
  { value: 'all', label: t('documentTypeAll') },
  { value: 'word', label: t('documentTypeWord') },
  { value: 'text', label: t('documentTypeText') },
  { value: 'sheets', label: t('documentTypeSheets') },
  { value: 'slides', label: t('documentTypeSlides') },
  { value: 'code', label: t('scriptFiles') },
  { value: 'images', label: t('imageFiles') },
])
const visibleFiles = computed(() => {
  const group: readonly string[] | undefined = documentType.value === 'all' ? undefined : documentScanGroups[documentType.value]
  const matches = appliedQuery.value ? results.value : showIndexedFiles.value ? catalog.value : []
  const visible = matches.flatMap(match => {
    const file = appliedQuery.value ? filesById.value.get(match.id) : match
    if (!file || isAuxiliaryFilePath(file.path) || (!settings.value.showSystemFiles && isHiddenPath(file.path))) return []
    const extension = file.extension.toLowerCase()
    if (!searchableFileExtensions.has(extension) || (group && !group.includes(extension))) return []
    return [{ ...file, contentMatch: match.contentMatch }]
  })
  if (sortBy.value !== 'relevance') visible.sort((a, b) => compareFileSizes(a, b, sortBy.value === 'size-desc'))
  return visible
})
const pageSize = computed(() => fileView.value === 'compact' ? compactFilePageSize : settings.value.documentPageSize)
const pageCount = computed(() => Math.max(1, Math.ceil(visibleFiles.value.length / pageSize.value)))
const pagedFiles = computed(() => visibleFiles.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
const renderedFiles = useProgressiveRows(pagedFiles)
let searchTimer: ReturnType<typeof setTimeout> | undefined
let searchVersion = 0
const search = async (background = false) => {
  if (!pageActive || isScanning.value) return
  const version = ++searchVersion
  const submitted = query.value.trim()
  const isCurrent = () => pageActive && !isScanning.value && version === searchVersion && query.value.trim() === submitted
  if (!background) {
    documentType.value = 'all'
    resetSearchFiltersAndSelection()
    searchLoading.value = true
  }
  try {
    const found = await searchOsDocuments(submitted, isCurrent)
    if (!isCurrent()) return
    results.value = found
    appliedQuery.value = submitted
    if (!background) currentPage.value = 1
    error.value = null
  } catch (cause) {
    if (!background && isCurrent()) error.value = 'documentsLoadError'
    console.error('Could not search documents:', cause)
  } finally { if (version === searchVersion) searchLoading.value = false }
}
watch(query, () => {
  searchVersion++
  error.value = null
  if (searchTimer) clearTimeout(searchTimer)
  if (!query.value.trim()) {
    results.value = []
    appliedQuery.value = ''
    searchLoading.value = false
    currentPage.value = 1
    return
  }
  if (!isScanning.value) {
    searchLoading.value = true
    searchTimer = setTimeout(() => { void search() }, 250)
  }
}, { flush: 'sync' })
watch([documentType, pageSize, sortBy], () => { currentPage.value = 1 })
watch(pageCount, count => { currentPage.value = Math.min(currentPage.value, count) })
watch(() => settings.value.showSystemFiles, () => { if (query.value.trim()) void search() })

const chooseScanFolders = async () => {
  if (isScanning.value || !drivePath.value) return
  error.value = null
  try {
    const selected = await window.electron.invoke('files:choose-scan-folders', { drivePath: drivePath.value })
    if (selected) scanFolders.value = [...new Set([...scanFolders.value, ...selected])]
  } catch (cause) {
    console.error('Could not choose scan folders:', cause)
    error.value = getScanErrorKey(cause) === 'scanDriveUnavailable' ? 'scanDriveUnavailable' : 'scanFolderChooseError'
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
    additionalDrivePaths.value = [...(saved.additionalDrivePaths ?? [])]
  }
  if (isScanning.value || !selectedExtensions.value.length || (isDesktop.value && (!drivePath.value || (scanScope.value === 'folders' && !scanFolders.value.length)))) return
  error.value = null
  const otherDrives = additionalDrives.value.filter(drive => additionalDrivePaths.value.includes(drive.path)).map(drive => drive.path)
  await startScan({
    resume,
    drivePath: drivePath.value,
    extensions: [...selectedExtensions.value],
    ...(scanScope.value === 'folders'
      ? { folderPaths: [...scanFolders.value] }
      : otherDrives.length ? { additionalDrivePaths: otherDrives } : {}),
  })
}
watch(isScanning, scanning => {
  if (scanning) {
    catalogBeforeScan.value = files.value
    if (searchTimer) clearTimeout(searchTimer)
    searchVersion++
    searchLoading.value = false
  } else {
    catalogBeforeScan.value = []
    const submitted = query.value.trim()
    if (submitted) void search(submitted === appliedQuery.value)
  }
}, { flush: 'sync' })
watch(completedScanCount, () => { if (!query.value.trim()) currentPage.value = 1 })

onMounted(async () => {
  isDesktop.value = Boolean(window.electron)
  try {
    const drivesRequest = isDesktop.value ? window.electron.invoke('files:list-scan-drives') : Promise.resolve([])
    const [, availableDrives] = await Promise.all([ensureIndex(), drivesRequest, refreshScanStatus()])
    if (!pageActive) return
    if (query.value.trim()) void search()
    if (isDesktop.value) {
      drives.value = availableDrives
      if (!drives.value.some(drive => drive.path === drivePath.value)) drivePath.value = drives.value[0]?.path ?? ''
      if (!drivePath.value) error.value = 'scanDriveUnavailable'
    }
  } catch (cause) {
    console.error('Could not load documents:', cause)
    error.value = 'documentsLoadError'
  }
})
onBeforeUnmount(() => {
  pageActive = false
  searchLoading.value = false
  if (searchTimer) clearTimeout(searchTimer)
  searchVersion++
})
</script>

<template>
  <section class="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable] p-5 md:p-7" :aria-busy="searchLoading">
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
        <div v-if="scanScope === 'drive' && additionalDrives.length" class="flex flex-wrap items-center gap-3">
          <span>{{ t('scanAdditionalDrives') }}</span>
          <UCheckbox v-for="drive in additionalDrives" :key="drive.path" :label="drive.label"
            :model-value="additionalDrivePaths.includes(drive.path)" :disabled="isScanning" size="sm"
            @update:model-value="checked => toggleAdditionalDrive(drive.path, checked === true)" />
        </div>
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
        <UCheckbox v-for="extension in baseDocumentScanExtensions" :key="extension" :model-value="selectedExtensions.includes(extension)"
          :label="extension.toUpperCase()" :aria-label="extension.toUpperCase()" :disabled="isScanning" size="sm"
          @update:model-value="checked => toggleScanExtension(extension, checked === true)" />
      </div>
      <details v-for="group in additionalScanGroups" :key="group.id" class="rounded-lg border border-surface-200 px-3 py-2 dark:border-surface-700">
        <summary class="cursor-pointer select-none">
          {{ t(group.label) }} ({{ formatNumber(group.extensions.filter(extension => selectedExtensions.includes(extension)).length) }} / {{ formatNumber(group.extensions.length) }})
        </summary>
        <div class="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          <UCheckbox v-for="extension in group.extensions" :key="extension" :model-value="selectedExtensions.includes(extension)"
            :label="extension.toUpperCase()" :aria-label="extension.toUpperCase()" :disabled="isScanning" size="sm"
            @update:model-value="checked => toggleScanExtension(extension, checked === true)" />
        </div>
      </details>
      <p class="text-surface-500">{{ t('scanDurationNotice') }}</p>
    </fieldset>
    <div class="flex min-h-8 flex-wrap items-center gap-3">
      <button type="button" class="rounded-lg bg-primary-600 px-3 py-2 font-medium text-white disabled:opacity-40" :disabled="isScanning || !selectedExtensions.length || (isDesktop && (!drivePath || (scanScope === 'folders' && !scanFolders.length)))" @click="scan()">
        {{ t(isScanning ? 'scanDocumentsInProgress' : isDesktop ? (scanScope === 'folders' ? 'scanSelectedFolders' : 'rescanOsDocuments') : 'scanDocuments') }}
      </button>
      <button v-if="isDesktop && !isScanning && resumableScan" type="button" class="rounded-lg border border-primary-500/50 px-3 py-2 font-medium text-primary-600 dark:text-primary-400" @click="scan(true)">{{ t('scanResume') }}</button>
      <button v-if="isScanning" type="button" class="rounded-lg border border-rose-500/50 px-3 py-2 font-medium text-rose-600 disabled:opacity-50 dark:text-rose-400" :disabled="isStopping" @click="stopScan">
        {{ t(isStopping ? 'scanStopping' : 'scanStop') }}
      </button>
    </div>
    </div>
    <div class="mb-3 grid min-h-8 text-xs">
      <Transition name="scan-state">
        <p v-if="error || scanError" key="error" class="col-start-1 row-start-1 text-rose-600 dark:text-rose-400" role="alert">{{ error ? t(error) : scanError }}</p>
        <p v-else-if="isScanning" key="progress" class="col-start-1 row-start-1 text-surface-500" role="status">
          {{ t(scanProgress?.phase === 'content' ? 'scanContentPhase' : 'scanMetadataPhase') }}
          <template v-if="scanProgress?.phase === 'metadata' && scanProgress.contentProcessed"> · {{ t('scanContentPhase') }}</template>
          <template v-if="scanProgress">
            · {{ t('scanFoundCount') }} {{ formatNumber(scanProgress.indexedCount) }}
            · {{ t('scanContentCount') }} {{ formatNumber(scanProgress.contentCount) }}
            · {{ t('scanDocumentsSkipped') }} {{ formatNumber(scanProgress.skippedCount) }}
          </template>
        </p>
        <p v-else-if="notice" key="result" class="col-start-1 row-start-1 text-primary-600 dark:text-primary-400" role="status">{{ notice }}</p>
        <p v-else-if="isDesktop && resumableScan" key="checkpoint" class="col-start-1 row-start-1 text-surface-500">
          {{ t('scanSavedProgress') }} <bdi>{{ [resumableScan.drivePath, ...(resumableScan.additionalDrivePaths ?? [])].join(', ') }}</bdi> · {{ t('scanFoundCount') }} {{ formatNumber(resumableScan.indexedCount) }}
        </p>
      </Transition>
    </div>
    <div class="mb-4 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
      <AppDropdown v-model="documentType" :options="typeOptions" class="w-52 max-w-full" />
      <label class="flex items-center gap-2 text-xs text-surface-500">
        <span>{{ t('sortLabel') }}</span>
        <AppDropdown v-model="sortBy" :options="documentSortOptions" :aria-label="t('sortLabel')" class="max-w-48" />
      </label>
      <FileViewSwitcher v-model="fileView" />
    </div>
    </div>
    <div class="grid min-h-48">
      <Transition name="scan-state">
    <IndexSkeleton v-if="searchLoading && !appliedQuery" key="loading" class="col-start-1 row-start-1" />
    <FileViewRows v-else-if="pagedFiles.length" key="results" :view="fileView" class="col-start-1 row-start-1">
      <FileCard v-for="file in renderedFiles" :key="file.id" :file="file" :layout="fileView" :search-query="appliedQuery" :active="activeFile?.id === file.id" @select="selectFile" @summary="openSummary" />
    </FileViewRows>
    <div v-else key="empty" class="col-start-1 row-start-1 flex min-h-48 flex-col items-center justify-center text-center">
      <Icon name="lucide:file-search" size="40" class="mb-3 text-surface-400" />
      <p class="font-semibold">{{ t(isScanning ? 'scanDocumentsInProgress' : appliedQuery || showIndexedFiles ? 'documentSearchEmpty' : 'enterFileSearchQuery') }}</p>
      <p v-if="appliedQuery && !isScanning" class="mt-1 text-xs text-surface-500">{{ t('documentSearchEmptyHint') }}</p>
      <button v-if="!appliedQuery && !showIndexedFiles && !isScanning" type="button"
        class="mt-3 rounded-lg border border-surface-200 px-3 py-2 text-sm dark:border-surface-700"
        @click="browseIndex = true">{{ t('showIndexedFiles') }}</button>
    </div>
      </Transition>
    </div>
    <footer v-if="visibleFiles.length" class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-surface-200 pt-3 text-xs text-surface-500 dark:border-surface-800">
      <span>{{ t('showingFiles') }} {{ formatNumber((currentPage - 1) * pageSize + 1) }}–{{ formatNumber(Math.min(currentPage * pageSize, visibleFiles.length)) }} {{ t('ofFiles') }} {{ formatNumber(visibleFiles.length) }}</span>
      <div class="flex flex-wrap items-center gap-2">
        <label v-if="fileView !== 'compact'" class="flex items-center gap-1.5">
          <span>{{ t('perPage') }}</span>
          <AppDropdown v-model="settings.documentPageSize" :options="documentPageSizes.map(value => ({ value, label: formatNumber(value) }))" :aria-label="t('documentResultsPerPage')" />
        </label>
        <button type="button" class="rounded-lg border border-surface-200 px-3 py-1.5 disabled:opacity-40 dark:border-surface-700" :disabled="currentPage <= 1" @click="currentPage--">{{ t('previousPage') }}</button>
        <span>{{ currentPage }} / {{ pageCount }}</span>
        <button type="button" class="rounded-lg border border-surface-200 px-3 py-1.5 disabled:opacity-40 dark:border-surface-700" :disabled="currentPage >= pageCount" @click="currentPage++">{{ t('nextPage') }}</button>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.scan-state-enter-active,
.scan-state-leave-active {
  transition: opacity 140ms ease-out;
}

.scan-state-leave-active { pointer-events: none; }

.scan-state-enter-from,
.scan-state-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .scan-state-enter-active,
  .scan-state-leave-active {
    transition: none;
  }
}
</style>
