<script setup lang="ts">
const { files, searchQuery, addFolder, addOneFile, openCreateFileDialog, searchIndexedFiles } = useFiles()
const { t, language } = useLanguage()
const { settings, setTheme } = useSettings()
const isIndexing = ref(false)
const searchShortcut = ref('Ctrl+K')
const searchInput = ref<HTMLInputElement | null>(null)
const indexNotice = ref('')
let usesMetaShortcut = false
let searchTimer: ReturnType<typeof setTimeout> | undefined
let indexNoticeTimer: ReturnType<typeof setTimeout> | undefined

const handleSearchShortcut = (event: KeyboardEvent) => {
  const modifierPressed = usesMetaShortcut ? event.metaKey : event.ctrlKey
  if (!modifierPressed || event.altKey || event.key.toLowerCase() !== 'k') return

  event.preventDefault()
  searchInput.value?.focus()
  searchInput.value?.select()
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
})

watch(searchQuery, (query) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => void searchIndexedFiles(query), 250)
})

const handleAddFolder = async () => {
  if (isIndexing.value) return
  isIndexing.value = true
  indexNotice.value = ''
  try {
    const result = await addFolder()
    if (indexNoticeTimer) clearTimeout(indexNoticeTimer)
    if (result) {
      indexNotice.value = result.indexedCount === 0
        ? t('folderNoFilesIndexed')
        : `${t('folderFilesIndexed')} ${result.indexedCount}${result.skippedCount ? `. ${t('folderLimitReached')} ${result.skippedCount}` : ''}`
    }
    if (indexNotice.value) indexNoticeTimer = setTimeout(() => { indexNotice.value = '' }, 7000)
  } catch (error) {
    console.error('Could not index selected folder:', error)
    indexNotice.value = t('folderIndexError')
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
           border-b border-gray-200 bg-white/80 px-4 backdrop-blur-md
           dark:border-gray-800 dark:bg-gray-900/80"
  >
    <!-- Logo -->

    <div class="flex w-64 items-center gap-3">
      <div
          class="flex h-9 w-9 items-center justify-center rounded-xl
               bg-gradient-to-tr from-emerald-600 to-emerald-400
               text-lg font-bold text-white shadow-lg"
      >
        <Icon name="lucide:brain" size="20" />
      </div>

      <div>
        <div class="flex items-center gap-2">
          <span class="text-lg font-bold tracking-tight">
            LocalMind
          </span>

          <span
              class="rounded border border-emerald-500/20
                   bg-emerald-500/10 px-1.5 py-0.5
                   text-[10px] font-medium text-emerald-600
                   dark:text-emerald-400"
          >
            OFFLINE
          </span>
        </div>

        <p class="-mt-1 text-[11px] text-gray-500 dark:text-gray-400">
          Local-first AI Search
        </p>
      </div>
    </div>

    <!-- Search -->

    <div class="max-w-2xl flex-1 px-4">
      <div class="relative">
        <Icon
            name="lucide:search"
            size="16"
            class="absolute left-3.5 top-1/2
                 -translate-y-1/2 text-gray-400"
        />

        <input
            ref="searchInput"
            v-model="searchQuery"
            type="text"
            :placeholder="t('searchPlaceholder')"
            class="w-full rounded-xl border border-transparent
                 bg-gray-100 py-2 pl-10 pr-20 text-sm
                 outline-none transition-all
                 placeholder:text-gray-400
                 focus:border-emerald-500
                 focus:ring-2 focus:ring-emerald-500/20
                 dark:bg-gray-800/80"
        />

        <span
            class="absolute right-3 top-1/2
                 -translate-y-1/2 rounded-md border
                 border-gray-200 bg-white px-2 py-0.5
                 text-[11px] font-medium text-gray-400
                 dark:border-gray-600 dark:bg-gray-700"
        >
          {{ searchShortcut }}
        </span>
      </div>
    </div>

    <!-- Actions -->

    <div class="flex items-center gap-3">
      <span v-if="indexNotice" class="max-w-56 text-xs text-amber-600 dark:text-amber-400" role="status">{{ indexNotice }}</span>
      <div
          class="hidden items-center gap-2 rounded-lg
               bg-gray-100 px-3 py-1.5 text-xs
               text-gray-600 dark:bg-gray-800
               dark:text-gray-300 md:flex"
      >
        <span class="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
        {{ t('indexed') }} <strong>{{ files.length }}</strong> {{ t('files') }}
      </div>

      <button
          class="flex items-center gap-2 rounded-xl
               bg-emerald-600 px-3.5 py-2 text-xs
               font-semibold text-white shadow-md
               transition hover:bg-emerald-500
               active:scale-95"
          :disabled="isIndexing"
          @click="handleAddFolder"
      >
        <Icon name="lucide:folder-plus" size="16" />
        <span>{{ isIndexing ? (language === 'ru' ? 'Индексация…' : 'Indexing…') : t('addFolder') }}</span>
      </button>

      <button
          type="button"
          class="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          :disabled="isAddingFile"
          @click="handleAddFile"
      >
        <Icon name="lucide:file-plus" size="16" />
        <span>{{ t('addFile') }}</span>
      </button>

      <button
          type="button"
          class="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          @click="openCreateFileDialog()"
      >
        <Icon name="lucide:file-pen" size="16" />
        <span>{{ t('createFile') }}</span>
      </button>

      <button
          class="rounded-xl p-2 text-gray-500 transition
               hover:bg-gray-100 hover:text-gray-700
               dark:text-gray-400 dark:hover:bg-gray-800
               dark:hover:text-gray-200"
          @click="toggleTheme"
      >
        <Icon
            :name="isDark ? 'lucide:sun' : 'lucide:moon'"
            size="20"
        />
      </button>
    </div>
  </header>
</template>
