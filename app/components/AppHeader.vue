<script setup lang="ts">
import { getScanErrorKey } from '~/utils/scanMessages'
import AppLogo from './AppLogo.vue'
const { activeFile, searchQuery, addFolder, addOneFile, openCreateFileDialog, resetSearchFiltersAndSelection, searchIndexedFiles, searchLoading, invalidateSearch } = useFiles()
const { t, language, formatNumber } = useLanguage()
const selectedExtension = computed(() => {
  const extension = activeFile.value?.extension.trim().replace(/^\.+/, '').toLowerCase()
  return extension ? '.' + extension : ''
})
const { settings, setTheme } = useSettings()
const { connectionStatus } = useAi()
const isGlobalConnected = computed(() => settings.value.modelProvider === 'global' && settings.value.globalModel.enabled && connectionStatus.value === 'ok')
const isLocalConnected = computed(() => settings.value.modelProvider === 'local' && settings.value.localModels[settings.value.localProvider].enabled && connectionStatus.value === 'ok')
const isIndexing = ref(false)
const searchShortcut = ref('Ctrl+K')
const searchInput = ref<HTMLInputElement | null>(null)
const route = useRoute()
const showFileSearch = computed(() => route.path === '/' || route.path === '/documents')
const { isScanning: isScanningDocuments } = useDocumentScanActivity()
const documentSearchQuery = useState('documents-search-query', () => '')
const documentSearchLoading = useState('documents-search-loading', () => false)
const headerSearchQuery = computed({
  get: () => route.path === '/documents' ? documentSearchQuery.value : searchQuery.value,
  set: value => { if (route.path === '/documents') documentSearchQuery.value = value; else searchQuery.value = value },
})
const headerSearchLoading = computed(() => route.path === '/documents' ? documentSearchLoading.value : searchLoading.value)
const indexNotice = ref('')
let usesMetaShortcut = false
let searchTimer: ReturnType<typeof setTimeout> | undefined
let indexNoticeTimer: ReturnType<typeof setTimeout> | undefined

const handleSearchShortcut = (event: KeyboardEvent) => {
  const modifierPressed = usesMetaShortcut ? event.metaKey : event.ctrlKey
  if (!modifierPressed || event.altKey || event.key.toLowerCase() !== 'k') return

  const input = showFileSearch.value ? searchInput.value : document.querySelector<HTMLInputElement>('[data-file-search-input]')
  if (!input) return
  event.preventDefault()
  input.focus()
  input.select()
}

onMounted(() => {
  const platform = window.electron?.platform ?? navigator.platform
  usesMetaShortcut = platform.toLowerCase().includes('darwin') || platform.toLowerCase().includes('mac')
  searchShortcut.value = usesMetaShortcut ? '⌘K' : 'Ctrl+K'
  window.addEventListener('keydown', handleSearchShortcut)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleSearchShortcut)
  if (indexNoticeTimer) clearTimeout(indexNoticeTimer)
  if (searchTimer) clearTimeout(searchTimer)
  invalidateSearch()
})

watch([() => route.path, searchQuery, isScanningDocuments], ([path, query, scanning]) => {
  if (searchTimer) clearTimeout(searchTimer)
  invalidateSearch()
  if (path !== '/') return
  if (!query.trim()) { void searchIndexedFiles(''); return }
  if (scanning) return
  searchLoading.value = true
  searchTimer = setTimeout(() => {
    resetSearchFiltersAndSelection()
    void searchIndexedFiles(query).catch(error => console.error('Could not search indexed files:', error))
  }, 250)
}, { flush: 'sync' })

const handleAddFolder = async () => {
  if (isIndexing.value) return
  isIndexing.value = true
  indexNotice.value = ''
  try {
    const result = await addFolder()
    if (indexNoticeTimer) clearTimeout(indexNoticeTimer)
    if (result) {
      indexNotice.value = t('folderFilesIndexed') + ' ' + formatNumber(result.indexedCount) + ' · ' +
        t('scanDocumentsSkipped') + ' ' + formatNumber(result.skippedCount)
    }
    if (indexNotice.value) indexNoticeTimer = setTimeout(() => { indexNotice.value = '' }, 7000)
  } catch (error) {
    console.error('Could not index selected folder:', error)
    indexNotice.value = t(getScanErrorKey(error))
    if (indexNoticeTimer) clearTimeout(indexNoticeTimer)
    indexNoticeTimer = setTimeout(() => { indexNotice.value = '' }, 7000)
  } finally {
    isIndexing.value = false
  }
}

const isDark = computed(() => settings.value.theme === 'dark')
const toggleTheme = () => setTheme(isDark.value ? 'light' : 'dark')
const isAddingFile = ref(false)

const handleAddFile = async () => {
  if (isAddingFile.value) return
  isAddingFile.value = true
  indexNotice.value = ''
  try {
    const result = await addOneFile()
    if (result) {
      indexNotice.value = `${t('folderFilesIndexed')} ${result.indexedCount}`
      if (indexNoticeTimer) clearTimeout(indexNoticeTimer)
      indexNoticeTimer = setTimeout(() => { indexNotice.value = '' }, 5000)
    }
  } catch (error) {
    console.error('Could not add file:', error)
    indexNotice.value = t('fileAddError')
  } finally {
    isAddingFile.value = false
  }
}

</script>

<template>
  <header
      class="z-20 flex h-16 shrink-0 items-center justify-between
           border-b border-surface-200 bg-white/80 px-4 backdrop-blur-md
           dark:border-surface-800 dark:bg-surface-900/80"
  >
    <!-- Logo -->

    <div class="flex shrink-0 items-center gap-3 pr-4 lg:w-64">
      <AppLogo />

      <div>
        <div class="flex items-center gap-2">
          <span class="text-lg font-bold tracking-tight">
            OwlSift
          </span>

          <span
              role="status"
              aria-live="polite"
              class="inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium transition-colors"
              :class="isGlobalConnected ? 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400' : 'border-primary-500/20 bg-primary-500/10 text-primary-600 dark:text-primary-400'"
          >
            <span class="size-1.5 rounded-full bg-current" aria-hidden="true" />
            {{ isGlobalConnected ? 'ONLINE' : 'OFFLINE' }}
            <span v-if="isLocalConnected" class="border-l border-current/30 pl-1">LOCAL</span>
          </span>
        </div>

        <div class="-mt-1 flex items-center gap-2 text-[11px] text-surface-500 dark:text-surface-400">
          <span class="whitespace-nowrap">Local-first AI Search</span>
          <output
            v-if="selectedExtension"
            dir="ltr"
            class="max-w-16 truncate rounded bg-primary-500/10 px-1 font-mono text-primary-700 dark:text-primary-300"
            :aria-label="t('fileType')"
            :title="selectedExtension"
          >{{ selectedExtension }}</output>
        </div>
      </div>
    </div>

    <!-- Search -->

    <div v-if="showFileSearch" class="min-w-0 max-w-2xl flex-1 px-4">
      <div class="relative">
        <Icon
            name="lucide:search"
            size="16"
            class="absolute left-3.5 top-1/2
                 -translate-y-1/2 text-surface-400"
        />

        <input
            ref="searchInput"
            data-file-search-input
            v-model="headerSearchQuery"
            type="text"
            :placeholder="t('searchPlaceholder')"
            :aria-busy="headerSearchLoading"
            class="w-full min-w-0 rounded-xl border border-transparent
                 bg-surface-100 py-2 pl-10 pr-20 text-sm
                 outline-none transition-colors duration-150 motion-reduce:transition-none
                 placeholder:text-surface-400
                 focus:border-primary-500
                 focus:ring-2 focus:ring-primary-500/20
                 dark:bg-surface-800/80"
        />

        <span
            class="absolute right-3 top-1/2
                 -translate-y-1/2 rounded-md border
                 border-surface-200 bg-white px-2 py-0.5
                 text-[11px] font-medium text-surface-400
                 dark:border-surface-600 dark:bg-surface-700"
        >
          {{ searchShortcut }}
        </span>
      </div>
    </div>

    <!-- Actions -->

    <div class="flex items-center gap-3">
      <span v-if="indexNotice" class="max-w-56 text-xs text-amber-600 dark:text-amber-400" role="status">{{ indexNotice }}</span>

      <button
          class="flex items-center gap-2 rounded-xl
               bg-primary-600 px-3.5 py-2 text-xs
               font-semibold text-white shadow-md
               transition hover:bg-primary-500
               active:scale-95"
          :disabled="isIndexing"
          @click="handleAddFolder"
      >
        <Icon name="lucide:folder-plus" size="16" />
        <span>{{ isIndexing ? (language === 'ru' ? 'Индексация…' : 'Indexing…') : t('addFolder') }}</span>
      </button>

      <button
          type="button"
          class="flex items-center gap-2 rounded-xl border border-surface-200 px-3 py-2 text-xs font-semibold text-surface-700 transition hover:bg-surface-100 dark:border-surface-700 dark:text-surface-200 dark:hover:bg-surface-800"
          :disabled="isAddingFile"
          @click="handleAddFile"
      >
        <Icon name="lucide:file-plus" size="16" />
        <span>{{ t('addFile') }}</span>
      </button>

      <button
          type="button"
          class="flex items-center gap-2 rounded-xl border border-surface-200 px-3 py-2 text-xs font-semibold text-surface-700 transition hover:bg-surface-100 dark:border-surface-700 dark:text-surface-200 dark:hover:bg-surface-800"
          @click="openCreateFileDialog()"
      >
        <Icon name="lucide:file-pen" size="16" />
        <span>{{ t('createFile') }}</span>
      </button>

      <button
          type="button"
          class="inline-grid size-9 shrink-0 place-items-center rounded-xl text-surface-600 transition-colors
               hover:bg-surface-100 hover:text-surface-900
               focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary
               dark:text-surface-300 dark:hover:bg-surface-800 dark:hover:text-surface-100"
          :title="t(isDark ? 'lightTheme' : 'darkTheme')"
          :aria-label="t(isDark ? 'lightTheme' : 'darkTheme')"
          @click="toggleTheme"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <g v-if="isDark">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42m0-14.14-1.42 1.42m-11.3 11.3-1.42 1.42" />
          </g>
          <path v-else d="M20.99 13.18a9 9 0 1 1-10.17-10.17 7 7 0 0 0 10.17 10.17Z" />
        </svg>
      </button>
    </div>
  </header>
</template>
