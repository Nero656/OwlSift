<script setup lang="ts">
const ids = defineModel<number[]>({ default: () => [] })
const outputFolder = defineModel<string | null>('outputFolder', { default: null })
const allowEdits = defineModel<boolean>('allowEdits', { default: false })
const props = withDefaults(defineProps<{ hideSelection?: boolean }>(), { hideSelection: false })
const emit = defineEmits<{ selectionApplied: [ids: number[]]; selectionClosed: [] }>()
const { files, folders, selectedFolder, importDroppedFiles } = useFiles()
const { t } = useLanguage()
const selected = computed(() => files.value.filter(file => ids.value.includes(file.id)))
const draftFiles = computed(() => files.value.filter(file => draft.value.includes(file.id)))
const importing = ref(false)
const notice = ref('')
const picker = ref<HTMLInputElement | null>(null)
const dialog = ref<HTMLDialogElement | null>(null)
const folderPath = ref('')
const query = ref('')
const draft = ref<number[]>([])
const view = ref<'grid' | 'list'>('grid')
const page = ref(1)
const pageSize = 24
const normalize = (value: string) => value.replace(/\\/g, '/').replace(/\/$/, '')
const folderFiles = computed(() => {
  if (!folderPath.value) return []
  const root = normalize(folderPath.value) + '/'
  const terms = query.value.trim().toLocaleLowerCase()
  return files.value.filter(file => normalize(file.path).startsWith(root) &&
    (!terms || [file.name, file.path, ...file.tags].join(' ').toLocaleLowerCase().includes(terms)))
})
const pageCount = computed(() => Math.max(1, Math.ceil(folderFiles.value.length / pageSize)))
const pageFiles = computed(() => folderFiles.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const selectedCount = computed(() => files.value.filter(file => draft.value.includes(file.id)).length)
watch([folderPath, query], () => { page.value = 1 })
watch(pageCount, count => { page.value = Math.min(page.value, count) })
const toggle = (file: { id: number }) => {
  draft.value = draft.value.includes(file.id) ? draft.value.filter(id => id !== file.id) : [...draft.value, file.id]
}
const open = () => {
  draft.value = [...ids.value]
  query.value = ''
  page.value = 1
  const current = folders.value.find(folder => folder.path === folderPath.value)
  folderPath.value = current?.path ?? folders.value.find(folder => (folder.path === selectedFolder.value || folder.name === selectedFolder.value))?.path ?? folders.value[0]?.path ?? ''
  dialog.value?.showModal()
}
const selectPage = () => { draft.value = [...new Set([...draft.value, ...pageFiles.value.map(file => file.id)])] }
const apply = () => {
  const existing = new Set(files.value.map(file => file.id))
  const selection = draft.value.filter(id => existing.has(id))
  ids.value = selection
  emit('selectionApplied', selection)
  dialog.value?.close()
}
const openComputerPicker = () => picker.value?.click()
const importFiles = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const sources = Array.from(input.files ?? [])
  if (!sources.length) return
  importing.value = true
  notice.value = ''
  try {
    const result = await importDroppedFiles(sources)
    ids.value = [...new Set([...ids.value, ...result.added.map(file => file.id)])]
    if (result.skipped) notice.value = t('documentImportError') + ' ' + result.skipped
  } catch { notice.value = t('fileAddError') }
  finally { importing.value = false; input.value = '' }
}
defineExpose({ open, openComputerPicker })
</script>
<template>
  <div :class="props.hideSelection ? 'contents' : 'w-full min-w-0 space-y-2'">
    <input ref="picker" type="file" multiple class="hidden" @change="importFiles">
    <p v-if="!props.hideSelection && selected.length" class="text-xs text-surface-500">{{ t('selectedDocuments') }} {{ selected.length }}</p>
    <div v-if="!props.hideSelection" class="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
      <button v-for="file in selected" :key="file.id" type="button" class="flex max-w-full items-center gap-1 rounded-lg bg-primary-500/10 px-2 py-1 text-xs text-primary-600" :title="t('cancel') + ': ' + file.name" @click="ids = ids.filter(id => id !== file.id)">
        <span class="truncate">{{ file.name }}</span><Icon name="lucide:x" size="12" />
      </button>
    </div>
    <p v-if="notice" role="alert" class="text-xs text-amber-600">{{ notice }}</p>
    <Teleport to="body">
      <dialog ref="dialog" aria-labelledby="document-picker-title"
        class="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-5xl overflow-y-auto rounded-2xl border border-surface-200 bg-white p-4 text-surface-900 shadow-2xl backdrop:bg-black/60 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-100 md:p-6"
        @click="($event.target === dialog) && dialog?.close()" @close="emit('selectionClosed')" @dragover.prevent @drop.prevent>
        <header class="mb-4 flex items-start justify-between gap-3">
          <h2 id="document-picker-title" class="text-lg font-semibold">{{ t('chooseDocuments') }}</h2>
          <button type="button" class="rounded-lg p-2 hover:bg-surface-100 dark:hover:bg-surface-800" :aria-label="t('closeDialog')" @click="dialog?.close()"><Icon name="lucide:x" size="18" /></button>
        </header>
        <div class="mb-4 flex flex-wrap items-end gap-3">
          <label class="min-w-0 flex-1 text-xs text-surface-500">{{ t('targetFolder') }}
            <AppDropdown v-model="folderPath" :options="folders.map(folder => ({ value: folder.path, label: folder.name }))" :placeholder="t('noIndexedFolders')" class="mt-1 w-full" />
          </label>
          <label class="min-w-0 flex-1 text-xs text-surface-500">{{ t('search') }}
            <input v-model="query" type="search" class="mt-1 block w-full rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-sm dark:border-surface-700 dark:bg-surface-800">
          </label>
          <div role="group" :aria-label="t('defaultFileView')" class="flex gap-1">
            <button type="button" class="rounded-lg border p-2" :class="view === 'grid' ? 'border-primary-500 text-primary-600' : 'border-surface-200 dark:border-surface-700'" :aria-pressed="view === 'grid'" :aria-label="t('gridView')" @click="view = 'grid'"><Icon name="lucide:layout-grid" size="18" /></button>
            <button type="button" class="rounded-lg border p-2" :class="view === 'list' ? 'border-primary-500 text-primary-600' : 'border-surface-200 dark:border-surface-700'" :aria-pressed="view === 'list'" :aria-label="t('listView')" @click="view = 'list'"><Icon name="lucide:list" size="18" /></button>
          </div>
        </div>
        <p class="mb-3 break-all text-xs text-surface-500">{{ folderPath }}</p>
        <div class="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span>{{ t('selectedDocuments') }} {{ selectedCount }}</span>
          <button type="button" :disabled="!pageFiles.length" class="rounded-lg border border-surface-200 px-3 py-2 disabled:opacity-40 dark:border-surface-700" @click="selectPage">{{ t('selectPage') }}</button>
          <button type="button" class="rounded-lg px-3 py-2" @click="draft = []">{{ t('clearSelection') }}</button>
        </div>
        <div v-if="pageFiles.length" :class="view === 'grid' ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3' : 'flex flex-col gap-3'">
          <FileCard v-for="file in pageFiles" :key="file.id" :file="file" :layout="view" selectable hide-summary :selected="draft.includes(file.id)" @toggle="toggle" />
        </div>
        <p v-else class="py-12 text-center text-sm text-surface-500">{{ t('noMatchingFiles') }}</p>
        <section class="mt-4 rounded-xl border border-surface-200 bg-surface-50 p-3 dark:border-surface-700 dark:bg-surface-800/50">
          <h3 class="mb-3 text-sm font-medium">{{ t('assistantOptions') }}</h3>
          <AiOutputSettings v-model="outputFolder" v-model:allow-edits="allowEdits" :selected-files="draftFiles" />
        </section>
        <footer class="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-surface-200 bg-white pt-3 dark:border-surface-700 dark:bg-surface-900">
          <div class="flex items-center gap-2 text-xs">
            <button type="button" class="rounded-lg border border-surface-200 px-3 py-2 disabled:opacity-40 dark:border-surface-700" :disabled="page <= 1" @click="page--">{{ t('previousPage') }}</button>
            <span>{{ page }} / {{ pageCount }}</span>
            <button type="button" class="rounded-lg border border-surface-200 px-3 py-2 disabled:opacity-40 dark:border-surface-700" :disabled="page >= pageCount" @click="page++">{{ t('nextPage') }}</button>
          </div>
          <div class="flex items-center gap-2 text-xs">
            <button type="button" class="rounded-xl border border-surface-200 px-3 py-2 dark:border-surface-700" @click="dialog?.close()">{{ t('cancel') }}</button>
            <button type="button" class="rounded-xl bg-primary-600 px-3 py-2 font-medium text-white" @click="apply">{{ t('attachSelected') }} ({{ selectedCount }})</button>
          </div>
        </footer>
      </dialog>
    </Teleport>
  </div>
</template>
