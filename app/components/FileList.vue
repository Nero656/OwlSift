<script setup lang="ts">
import FileCard from './FileCard.vue'
import { compactFilePageSize, fileViews } from '~/utils/fileViews'
import { fileSizeSortOptions } from '~/utils/fileSizeSort'
import type { ContextMenuItem } from '@nuxt/ui'
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
  indexLoading,
  matchesSelectedFolder,
  activeFile,
  selectedFileIds: selectedIds,
  selectedFiles: selectedDocuments,
  selectFile,
  sortBy,
  selectedTag,
  selectedType,
  selectedFolder,
  searchQuery,
  appliedSearchQuery,
  searchLoading,
  allTags,
  openCreateFileDialog,
  addOneFile,
  openFileTransfer,
  loadIndex,
  searchIndexedFiles,
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
const { settings } = useSettings()
const { summarize } = useAi()
const rightTab = useState<'chat' | 'summary'>('ai-panel-tab', () => 'chat')
const controlsCollapsed = useState('file-management-controls-collapsed', () => false)
onMounted(() => { controlsCollapsed.value = localStorage.getItem('file-management-controls-collapsed') === 'true' })
watch(controlsCollapsed, value => { if (import.meta.client) localStorage.setItem('file-management-controls-collapsed', String(value)) })
const folderScopedFiles = computed(() => files.value.filter(file =>
  (settings.value.showSystemFiles || !isHiddenPath(file.path)) && matchesSelectedFolder(file.path),
))
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
const pageSize = computed(() => fileView.value === 'compact' ? compactFilePageSize : settings.value.pageSize)
const pageCount = computed(() => Math.max(1, Math.ceil(filteredFiles.value.length / pageSize.value)))
const pagedFiles = computed(() => filteredFiles.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
const renderedFiles = useProgressiveRows(pagedFiles)
const firstVisible = computed(() => filteredFiles.value.length ? (currentPage.value - 1) * pageSize.value + 1 : 0)
const lastVisible = computed(() => Math.min(currentPage.value * pageSize.value, filteredFiles.value.length))

watch([appliedSearchQuery, selectedTag, selectedType, selectedFolder, pageSize, sortBy], () => { currentPage.value = 1 })
watch(() => filteredFiles.value.length, () => { currentPage.value = 1 })
watch(pageCount, count => { if (currentPage.value > count) currentPage.value = count })

const openSummary = async (file: LocalFile) => {
  if (!selectedIds.value.includes(file.id)) selectedIds.value = [...selectedIds.value, file.id]
  selectFile(file)
  rightTab.value = 'summary'
  await summarize(file)
}
const toast = useToast()
const contextFolderPath = ref<string | undefined>()
const contextBusy = ref(false)
const captureContextFolder = (open: boolean) => {
  if (open) contextFolderPath.value = dropFolderPath.value
}
const guardWorkspaceContext = (event: MouseEvent) => {
  const target = event.target as Element | null
  // Nested file menus own their events; Reka prevents the outer menu from opening.
  if (target?.closest('article[data-file-card]')) return
  if (target?.closest('[data-workspace-controls], button, a, input, textarea, select, footer, [role="menu"]')) event.preventDefault()
}
const runContextAction = async (action: () => Promise<unknown>) => {
  if (contextBusy.value) return
  contextBusy.value = true
  try { await action() }
  catch (error) {
    toast.add({ title: t('workspaceActionError'), description: error instanceof Error ? error.message : String(error), color: 'error' })
  } finally { contextBusy.value = false }
}
const sortOptions = computed(() => ([
  { value: 'relevance', label: 'sortRelevance' },
  { value: 'date', label: 'sortDate' },
  { value: 'name', label: 'sortName' },
  { value: 'type', label: 'sortType' },
  { value: 'tag', label: 'sortTag' },
  ...fileSizeSortOptions,
] as const).map(option => ({ value: option.value, label: t(option.label) })))
const workspaceContextItems = computed<ContextMenuItem[][]>(() => [
  [
    { label: t('createFile'), icon: 'i-lucide-file-plus-2', onSelect: () => { openCreateFileDialog(contextFolderPath.value) } },
    { label: desktop.value ? t('addFileToFolder') : t('addFile'), icon: 'i-lucide-file-input', disabled: contextBusy.value, onSelect: () => { void runContextAction(() => addOneFile(contextFolderPath.value)) } },
  ],
  [
    { label: t('refreshWorkspace'), icon: 'i-lucide-refresh-cw', disabled: contextBusy.value, onSelect: () => { void runContextAction(async () => { await loadIndex(); if (searchQuery.value.trim()) await searchIndexedFiles(searchQuery.value) }) } },
    { label: t('copyFolderPath'), icon: 'i-lucide-copy', disabled: !contextFolderPath.value || contextBusy.value, onSelect: () => { const path = contextFolderPath.value; if (path) void runContextAction(() => navigator.clipboard.writeText(path)) } },
  ],
  [
    { label: t('selectPage'), icon: 'i-lucide-list-checks', disabled: !pagedFiles.value.length, onSelect: () => { selectPage() } },
    { label: t('clearSelection'), icon: 'i-lucide-list-x', disabled: !selectedIds.value.length, onSelect: () => { clearSelection() } },
  ],
  [
    { label: t('workspaceView'), icon: 'i-lucide-panels-top-left', children: [
      ...fileViews.map(view => ({
        label: t(view.label), icon: view.icon, type: 'checkbox' as const, checked: fileView.value === view.value,
        onSelect: () => { fileView.value = view.value },
      })),
    ] },
    { label: t('sortLabel'), icon: 'i-lucide-arrow-down-wide-narrow', children: [
      ...sortOptions.value.map(option => ({
        label: option.label, type: 'checkbox' as const, checked: sortBy.value === option.value,
        onSelect: () => { sortBy.value = option.value },
      })),
    ] },
  ],
])

</script>

<template>
  <UContextMenu :items="workspaceContextItems" :modal="false" :content="{ collisionPadding: 12 }"
    :ui="{ content: 'z-[150] min-w-56 max-w-[calc(100vw-2rem)] max-h-[var(--reka-context-menu-content-available-height)] overflow-y-auto', item: 'cursor-pointer' }"
    @update:open="captureContextFolder">
  <FileDropZone data-testid="workspace-file-area" tabindex="0" role="region" :aria-label="t('workspaceContextMenu')" @contextmenu="guardWorkspaceContext" :folder-path="dropFolderPath" class="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable] p-4" :aria-busy="searchLoading">
    <div data-workspace-controls class="sticky top-0 z-20 flex flex-col border border-surface-200 bg-white text-xs shadow-sm transition-[width,max-height,padding,margin,border-radius] duration-200 ease-in-out motion-reduce:transition-none dark:border-surface-700 dark:bg-surface-900" :class="controlsCollapsed ? 'mx-auto mb-3 h-10 w-10 max-h-10 items-center justify-center overflow-hidden rounded-full p-1' : 'mb-3 w-full max-h-[35dvh] gap-3 overflow-x-hidden overflow-y-auto overscroll-contain rounded-xl p-3'">
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
      <FileViewSwitcher v-model="fileView" />

      <label class="flex min-w-0 items-center gap-2 text-xs text-surface-500">
        <span>{{ t('sortLabel') }}</span>
        <AppDropdown v-model="sortBy" :options="sortOptions" :aria-label="t('sortLabel')" class="max-w-48" />
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

    <IndexSkeleton v-if="(indexLoading && !filteredFiles.length) || (searchLoading && !appliedSearchQuery)" />
    <div
        v-else-if="filteredFiles.length === 0"
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

      <p v-if="appliedSearchQuery || selectedType || selectedTag" class="mt-1 text-xs text-surface-500">
        {{ t('adjustQuery') }}
      </p>
      <div class="mt-4 flex gap-2">
        <button type="button" class="rounded-xl bg-primary-600 px-3 py-2 text-xs font-semibold text-white" @click="openCreateFileDialog()">{{ t('createFile') }}</button>
        <button type="button" class="rounded-xl border border-surface-200 px-3 py-2 text-xs font-medium text-surface-600 dark:border-surface-700 dark:text-surface-300" @click="addOneFile()">{{ t('addFile') }}</button>
      </div>
    </div>

    <FileViewRows v-else :view="fileView">
      <FileCard
          v-for="file in renderedFiles"
          :key="file.id"
          :file="file"
          :layout="fileView"
          :search-query="appliedSearchQuery"
          :active="activeFile?.id === file.id"
          selectable
          :selected="selectedIds.includes(file.id)"
          @toggle="toggleDocument"
          @select="previewSelectedDocument"
          @summary="openSummary"
      />
    </FileViewRows>

    <footer v-if="filteredFiles.length" class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-surface-100 pt-3 text-xs text-surface-500 dark:border-surface-800">
      <div class="flex items-center gap-2">
        <span>{{ t('showingFiles') }} {{ firstVisible }}–{{ lastVisible }} {{ t('ofFiles') }} {{ filteredFiles.length }}</span>
        <label v-if="fileView !== 'compact'" class="flex items-center gap-1.5">
          <span>{{ t('perPage') }}</span>
          <AppDropdown v-model="settings.pageSize" :options="[25, 50, 100].map(value => ({ value, label: String(value) }))" />
        </label>
      </div>
      <div class="flex items-center gap-2">
        <button type="button" class="rounded-lg border border-surface-200 px-3 py-1.5 transition hover:bg-surface-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-surface-700 dark:hover:bg-surface-800" :disabled="currentPage <= 1" @click="currentPage--">{{ t('previousPage') }}</button>
        <span>{{ t('page') }} {{ currentPage }} {{ t('ofFiles') }} {{ pageCount }}</span>
        <button type="button" class="rounded-lg border border-surface-200 px-3 py-1.5 transition hover:bg-surface-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-surface-700 dark:hover:bg-surface-800" :disabled="currentPage >= pageCount" @click="currentPage++">{{ t('nextPage') }}</button>
      </div>
    </footer>

  </FileDropZone>
  </UContextMenu>
</template>

<style scoped>
.panel-collapse-enter-active,
.panel-collapse-leave-active { overflow: hidden; transition: opacity 120ms ease-out; }
.panel-collapse-enter-from,
.panel-collapse-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .panel-collapse-enter-active, .panel-collapse-leave-active { transition: none; } }
</style>
