<script setup lang="ts">
import FileCard from './FileCard.vue'
import { imageFileExtensions, scriptFileExtensions } from '~/utils/fileTypeGroups'
import { isHiddenPath } from '../../src/utils/fileVisibility'
import type { LocalFile } from '~/types/file'
const { t } = useLanguage()
const desktop = ref(false)
onMounted(() => { desktop.value = Boolean(window.electron) })

const {
  files,
  folders,
  filteredFiles,
  activeFile,
  selectedFileIds: selectedIds,
  selectedFiles: selectedDocuments,
  selectFile,
  sortBy,
  selectedTag,
  selectedType,
  selectedFolder,
  searchQuery,
  allTags,
  openCreateFileDialog,
  addOneFile,
  openFileTransfer,
} = useFiles()
const dropFolderPath = computed(() => folders.value.find(folder => (folder.path === selectedFolder.value || folder.name === selectedFolder.value))?.path)
const attachedIds = useState<number[]>('ai-attached-document-ids', () => [])
const toggleDocument = (file: { id: number }) => { selectedIds.value = selectedIds.value.includes(file.id) ? selectedIds.value.filter(id => id !== file.id) : [...selectedIds.value, file.id] }
const previewSelectedDocument = (file: LocalFile) => {
  const selected = selectedDocuments.value.find(item => item.id === file.id) ?? selectedDocuments.value[0]
  if (selected) selectFile(selected)
  else activeFile.value = null
}
const clearSelection = () => { selectedIds.value = []; activeFile.value = null }
const selectPage = () => {
  selectedIds.value = [...new Set([...selectedIds.value, ...pagedFiles.value.map(file => file.id)])]
  const first = selectedDocuments.value[0]
  if (first) previewSelectedDocument(activeFile.value ?? first)
}
const analyzeSelection = async () => { attachedIds.value = selectedDocuments.value.map(file => file.id); await navigateTo('/ai_assistant') }
watch(selectedFolder, clearSelection)
watch(files, () => { const existing = new Set(files.value.map(file => file.id)); selectedIds.value = selectedIds.value.filter(id => existing.has(id)) })
const { settings } = useSettings()
const { summarize } = useAi()
const rightTab = useState<'chat' | 'summary'>('ai-panel-tab', () => 'chat')
const controlsCollapsed = useState('file-management-controls-collapsed', () => false)
onMounted(() => { controlsCollapsed.value = localStorage.getItem('file-management-controls-collapsed') === 'true' })
watch(controlsCollapsed, value => { if (import.meta.client) localStorage.setItem('file-management-controls-collapsed', String(value)) })
const folderScopedFiles = computed(() => files.value.filter(file => {
  if (!settings.value.showSystemFiles && isHiddenPath(file.path)) return false
  if (!selectedFolder.value) return true
  const folderPath = folders.value.find(folder => (folder.path === selectedFolder.value || folder.name === selectedFolder.value))?.path ?? selectedFolder.value
  const normalize = (value: string) => value.split(String.fromCharCode(92)).join('/').replace(/[/]$/, '')
  return normalize(file.path) === normalize(folderPath) || normalize(file.path).startsWith(normalize(folderPath) + '/')
}))
const typeCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const file of folderScopedFiles.value) {
    const extension = file.extension.toLowerCase()
    counts.set(extension, (counts.get(extension) ?? 0) + 1)
  }
  return counts
})
const typeFilters = computed(() => [
  { value: null, label: t('allTypes'), count: folderScopedFiles.value.length },
  ...[...typeCounts.value.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([extension, count]) => ({ value: extension, label: extension.toUpperCase(), count })),
  { value: '__scripts__', label: t('scriptFiles'), count: [...typeCounts.value].reduce((sum, [extension, count]) => sum + (scriptFileExtensions.has(extension) ? count : 0), 0) },
  { value: '__images__', label: t('imageFiles'), count: [...typeCounts.value].reduce((sum, [extension, count]) => sum + (imageFileExtensions.has(extension) ? count : 0), 0) },
])
const fileView = computed({
  get: () => settings.value.fileView,
  set: value => { settings.value.fileView = value },
})
const currentPage = ref(1)
const pageSize = computed({
  get: () => settings.value.pageSize,
  set: value => { settings.value.pageSize = Number(value) },
})
const pageCount = computed(() => Math.max(1, Math.ceil(filteredFiles.value.length / pageSize.value)))
const pagedFiles = computed(() => filteredFiles.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
const firstVisible = computed(() => filteredFiles.value.length ? (currentPage.value - 1) * pageSize.value + 1 : 0)
const lastVisible = computed(() => Math.min(currentPage.value * pageSize.value, filteredFiles.value.length))

watch([searchQuery, selectedTag, selectedType, selectedFolder], () => { currentPage.value = 1 })
watch(() => filteredFiles.value.length, () => { currentPage.value = 1 })
watch(pageCount, count => { if (currentPage.value > count) currentPage.value = count })

const openSummary = async (file: LocalFile) => {
  if (!selectedIds.value.includes(file.id)) selectedIds.value = [...selectedIds.value, file.id]
  selectFile(file)
  rightTab.value = 'summary'
  await summarize(file)
}
</script>

<template>
  <FileDropZone :folder-path="dropFolderPath" class="min-h-0 flex-1 overflow-y-auto p-4">
    <div class="sticky top-0 z-20 flex flex-col border border-surface-200 bg-white text-xs shadow-sm transition-[width,max-height,padding,margin,border-radius] duration-200 ease-in-out motion-reduce:transition-none dark:border-surface-700 dark:bg-surface-900" :class="controlsCollapsed ? 'mx-auto mb-3 h-10 w-10 max-h-10 items-center justify-center overflow-hidden rounded-full p-1' : 'mb-3 w-full max-h-[35dvh] gap-3 overflow-x-hidden overflow-y-auto overscroll-contain rounded-xl p-3'">
      <Transition name="panel-collapse">
      <div v-if="!controlsCollapsed" class="space-y-3">
      <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs text-surface-500">{{ t('selectedDocuments') }} {{ selectedDocuments.length }}</span>
      <button type="button" class="rounded-lg border border-surface-200 px-3 py-2 dark:border-surface-700" :disabled="!pagedFiles.length" @click="selectPage">{{ t('selectPage') }}</button>
      <button type="button" class="rounded-lg px-3 py-2 text-surface-500 disabled:opacity-40" :disabled="!selectedIds.length" @click="clearSelection">{{ t('clearSelection') }}</button>
      <UButton v-if="desktop" color="neutral" variant="outline" size="sm" :disabled="!selectedDocuments.length" @click="openFileTransfer(selectedDocuments.map(file => file.id),'copy')">{{ t('workspaceCopy') }}</UButton>
      <UButton v-if="desktop" color="neutral" variant="outline" size="sm" :disabled="!selectedDocuments.length" @click="openFileTransfer(selectedDocuments.map(file => file.id),'move')">{{ t('workspaceMove') }}</UButton>
      <button type="button" class="ml-auto rounded-lg bg-primary-600 px-3 py-2 text-white disabled:opacity-40" :disabled="!selectedDocuments.length" @click="analyzeSelection">{{ t('analyzeSelection') }}</button>
      <button type="button" class="flex h-8 w-8 items-center justify-center rounded-full text-surface-500 transition hover:bg-surface-100 hover:text-primary-600 dark:hover:bg-surface-800" :aria-label="t('collapseFileControls')" :title="t('collapseFileControls')" aria-expanded="true" @click="controlsCollapsed = true">
        <Icon name="lucide:chevron-up" size="16" />
      </button>
      </div>
      <div class="flex flex-wrap items-center gap-3">
      <div class="inline-flex rounded-lg border border-surface-200 p-1 dark:border-surface-700" role="group" :aria-label="t('search')">
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors"
          :class="fileView === 'list' ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400' : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800'"
          :aria-pressed="fileView === 'list'"
          @click="fileView = 'list'"
        >
          <Icon name="lucide:list" size="14" />{{ t('listView') }}
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors"
          :class="fileView === 'grid' ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400' : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800'"
          :aria-pressed="fileView === 'grid'"
          @click="fileView = 'grid'"
        >
          <Icon name="lucide:layout-grid" size="14" />{{ t('gridView') }}
        </button>
      </div>

      <label class="flex min-w-0 items-center gap-2 text-xs text-surface-500">
        <span>{{ t('sortLabel') }}</span>
        <AppDropdown v-model="sortBy" :options="[{ value: 'relevance', label: t('sortRelevance') }, { value: 'date', label: t('sortDate') }, { value: 'name', label: t('sortName') }, { value: 'type', label: t('sortType') }, { value: 'tag', label: t('sortTag') }]" class="max-w-40" />
      </label>

      <label class="flex min-w-0 items-center gap-2 text-xs text-surface-500">
        <span>{{ t('filterTag') }}</span>
        <AppDropdown v-model="selectedTag" :options="[{ value: null, label: t('allTags') }, ...allTags.map(tag => ({ value: tag, label: '#' + tag }))]" class="max-w-40" />
      </label>
      </div>
      <div class="flex flex-wrap gap-2" role="group" :aria-label="t('filterType')">
        <button
          v-for="filter in typeFilters"
          :key="filter.value ?? 'all'"
          type="button"
          class="rounded-lg px-3 py-1.5 text-[11px] font-medium transition-colors"
          :class="selectedType === filter.value ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400' : 'bg-surface-100 text-surface-500 hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-400 dark:hover:bg-surface-700'"
          :aria-pressed="selectedType === filter.value"
          @click="selectedType = filter.value"
        >{{ filter.label }} <span class="opacity-60">({{ filter.count }})</span></button>
      </div>
      </div>
      </Transition>
      <button v-if="controlsCollapsed" type="button" class="flex h-8 w-8 items-center justify-center rounded-full text-surface-500 transition hover:bg-surface-100 hover:text-primary-600 dark:hover:bg-surface-800 dark:hover:text-primary-400" :aria-label="t('expandFileControls')" :title="t('fileControls')" aria-expanded="false" @click="controlsCollapsed = false">
        <Icon name="lucide:chevron-down" size="16" />
      </button>
    </div>

    <div
        v-if="filteredFiles.length === 0"
        class="flex h-64 flex-col items-center
             justify-center text-center"
    >
      <Icon
          name="lucide:file-search"
          size="48"
          class="mb-3 text-surface-300 dark:text-surface-700"
      />

      <p class="font-semibold text-surface-700 dark:text-surface-300">
        {{ t('noMatchingFiles') }}
      </p>

      <p class="mt-1 text-xs text-surface-500">
        {{ t('adjustQuery') }}
      </p>
      <div class="mt-4 flex gap-2">
        <button type="button" class="rounded-xl bg-primary-600 px-3 py-2 text-xs font-semibold text-white" @click="openCreateFileDialog()">{{ t('createFile') }}</button>
        <button type="button" class="rounded-xl border border-surface-200 px-3 py-2 text-xs font-medium text-surface-600 dark:border-surface-700 dark:text-surface-300" @click="addOneFile()">{{ t('addFile') }}</button>
      </div>
    </div>

    <div v-else :class="fileView === 'grid' ? 'grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3' : 'flex flex-col gap-3'">
      <FileCard
          v-for="file in pagedFiles"
          :key="file.id"
          :file="file"
          :layout="fileView"
          :active="activeFile?.id === file.id"
          selectable
          :selected="selectedIds.includes(file.id)"
          @toggle="toggleDocument"
          @select="previewSelectedDocument"
          @summary="openSummary"
      />
    </div>

    <footer v-if="filteredFiles.length" class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-surface-100 pt-3 text-xs text-surface-500 dark:border-surface-800">
      <div class="flex items-center gap-2">
        <span>{{ t('showingFiles') }} {{ firstVisible }}–{{ lastVisible }} {{ t('ofFiles') }} {{ filteredFiles.length }}</span>
        <label class="flex items-center gap-1.5">
          <span>{{ t('perPage') }}</span>
          <AppDropdown v-model="pageSize" :options="[25, 50, 100].map(value => ({ value, label: String(value) }))" />
        </label>
      </div>
      <div class="flex items-center gap-2">
        <button type="button" class="rounded-lg border border-surface-200 px-3 py-1.5 transition hover:bg-surface-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-surface-700 dark:hover:bg-surface-800" :disabled="currentPage <= 1" @click="currentPage--">{{ t('previousPage') }}</button>
        <span>{{ t('page') }} {{ currentPage }} {{ t('ofFiles') }} {{ pageCount }}</span>
        <button type="button" class="rounded-lg border border-surface-200 px-3 py-1.5 transition hover:bg-surface-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-surface-700 dark:hover:bg-surface-800" :disabled="currentPage >= pageCount" @click="currentPage++">{{ t('nextPage') }}</button>
      </div>
    </footer>

  </FileDropZone>
</template>

<style scoped>
.panel-collapse-enter-active,
.panel-collapse-leave-active { overflow: hidden; transition: max-height 180ms ease, opacity 150ms ease; }
.panel-collapse-enter-from,
.panel-collapse-leave-to { max-height: 0; opacity: 0; }
.panel-collapse-enter-to,
.panel-collapse-leave-from { max-height: 35dvh; opacity: 1; }
@media (prefers-reduced-motion: reduce) { .panel-collapse-enter-active, .panel-collapse-leave-active { transition: none; } }
</style>
