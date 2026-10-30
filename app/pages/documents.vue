<script setup lang="ts">
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
const isScanning = ref(false)
const notice = ref('')
const error = ref('')
const currentPage = ref(1)
const extensions = ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'markdown', 'log', 'csv', 'tsv', 'xls', 'xlsx', 'ods', 'ppt', 'pptx', 'odp', 'html', 'htm', 'json', 'xml', 'yaml', 'yml']
const selectedExtensions = ref([...extensions])
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

const scan = async () => {
  if (isScanning.value || !selectedExtensions.value.length || (isDesktop.value && !drivePath.value)) return
  isScanning.value = true
  error.value = ''
  notice.value = ''
  try {
    let result
    if (isDesktop.value) {
      await window.electron.invoke('files:set-system-visibility', settings.value.showSystemFiles)
      result = await window.electron.invoke('files:scan-os-documents', { drivePath: drivePath.value, extensions: [...selectedExtensions.value] })
      await loadIndex()
    } else {
      result = await addFolder({ extensions: [...selectedExtensions.value] })
    }
    if (result) {
      notice.value = `${t('osDocumentsUpdated')} ${result.indexedCount}. ${t('scanDocumentsSkipped')} ${result.skippedCount}`
      if (query.value.trim()) await search()
    }
  } catch (cause) {
    console.error('Could not scan documents:', cause)
    error.value = t('folderIndexError')
  } finally {
    isScanning.value = false
  }
}
onMounted(async () => {
  isDesktop.value = Boolean(window.electron)
  try {
    await loadIndex()
    if (isDesktop.value) {
      drives.value = await window.electron.invoke('files:list-scan-drives')
      drivePath.value = drives.value[0]?.path ?? ''
    }
  } catch (cause) {
    console.error('Could not load documents:', cause)
    error.value = t('documentsLoadError')
  }
})
onBeforeUnmount(() => {
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
    <fieldset :disabled="isScanning" class="mb-5 space-y-3 rounded-xl border border-surface-200 p-4 text-xs dark:border-surface-700">
      <label v-if="isDesktop" class="flex flex-wrap items-center gap-3">
        <span>{{ t('scanDriveLabel') }}</span>
        <select v-model="drivePath" class="rounded-lg border border-surface-200 bg-white px-3 py-2 dark:border-surface-700 dark:bg-surface-800">
          <option v-for="drive in drives" :key="drive.path" :value="drive.path">{{ drive.label }}</option>
        </select>
      </label>
      <div class="flex flex-wrap items-center gap-3">
        <span>{{ t('scanExtensionsLabel') }}</span>
        <button type="button" class="text-primary-600 dark:text-primary-400" @click="selectedExtensions = [...extensions]">{{ t('selectAllExtensions') }}</button>
        <button type="button" class="text-surface-500" @click="selectedExtensions = []">{{ t('clearExtensionSelection') }}</button>
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-2">
        <label v-for="extension in extensions" :key="extension" class="flex items-center gap-1.5">
          <input v-model="selectedExtensions" type="checkbox" :value="extension">
          {{ extension.toUpperCase() }}
        </label>
      </div>
      <p class="text-surface-500">{{ t('scanDurationNotice') }}</p>
      <button type="button" class="rounded-lg bg-primary-600 px-3 py-2 font-medium text-white disabled:opacity-40" :disabled="isScanning || !selectedExtensions.length || (isDesktop && !drivePath)" @click="scan">
        {{ t(isScanning ? 'scanDocumentsInProgress' : isDesktop ? 'rescanOsDocuments' : 'scanDocuments') }}
      </button>
    </fieldset>
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
