<script setup lang="ts">
import type { LocalFile } from '~/types/file'

const {
  files, activeFile, selectFile, loadIndex, addTagToFile, removeTagFromFile, updateFileNote,
} = useFiles()
const { t } = useLanguage()

const query = ref('')
const noteDraft = ref('')
const tagDraft = ref('')
const tagInputOpen = ref(false)
const saveError = ref(false)
let noteTimer: ReturnType<typeof setTimeout> | undefined
let pendingSave: { fileId: number; note: string } | undefined

const visibleFiles = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase()
  if (!needle) return files.value
  return files.value.filter(file => [file.name, file.path, file.note, ...file.tags]
    .some(value => value.toLocaleLowerCase().includes(needle)))
})

const persistPendingNote = async () => {
  if (!pendingSave) return
  const save = pendingSave
  pendingSave = undefined
  if (noteTimer) clearTimeout(noteTimer)
  noteTimer = undefined
  try {
    await updateFileNote(save.fileId, save.note)
    saveError.value = false
  } catch (error) {
    console.error('Could not save note:', error)
    saveError.value = true
  }
}

watch(() => activeFile.value?.id, async (fileId) => {
  await persistPendingNote()
  const selected = files.value.find(file => file.id === fileId)
  noteDraft.value = selected?.note ?? ''
  tagDraft.value = ''
  tagInputOpen.value = false
  saveError.value = false
})

watch(noteDraft, (note) => {
  const fileId = activeFile.value?.id
  if (!fileId || note === activeFile.value?.note) return
  pendingSave = { fileId, note }
  if (noteTimer) clearTimeout(noteTimer)
  noteTimer = setTimeout(() => { void persistPendingNote() }, 500)
})

const chooseFile = (file: LocalFile) => selectFile(file)

const saveTag = async () => {
  const file = activeFile.value
  const tag = tagDraft.value.trim()
  if (!file || !tag) return
  try {
    await addTagToFile(file.id, tag)
    tagDraft.value = ''
    tagInputOpen.value = false
  } catch (error) {
    console.error('Could not save file tag:', error)
  }
}

const deleteTag = async (tag: string) => {
  const file = activeFile.value
  if (!file) return
  try {
    await removeTagFromFile(file.id, tag)
  } catch (error) {
    console.error('Could not remove file tag:', error)
  }
}

onMounted(async () => {
  if (!files.value.length) await loadIndex()
  if (!activeFile.value && files.value.length) selectFile(files.value[0]!)
})

onBeforeUnmount(() => { void persistPendingNote() })
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col overflow-y-auto p-5 md:p-7">
    <header class="mb-5">
      <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">{{ t('notesTitle') }}</h1>
      <p class="mt-1 text-sm text-gray-500">{{ t('notesDescription') }}</p>
    </header>

    <div class="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.5fr)]">
      <section class="flex min-h-72 min-w-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900/60">
        <div class="border-b border-gray-200 p-3 dark:border-gray-800">
          <label class="relative block">
            <Icon name="lucide:search" size="15" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input v-model="query" :placeholder="t('notesSearch')" class="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-3 text-xs outline-none focus:border-emerald-500 dark:border-gray-700 dark:bg-gray-800">
          </label>
        </div>

        <div v-if="visibleFiles.length" class="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
          <button
            v-for="file in visibleFiles"
            :key="file.id"
            type="button"
            class="w-full rounded-xl p-3 text-left transition-colors"
            :class="activeFile?.id === file.id ? 'bg-emerald-500/10 ring-1 ring-emerald-500/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800/70'"
            @click="chooseFile(file)"
          >
            <span class="flex min-w-0 items-center gap-2">
              <Icon name="lucide:file-text" size="16" class="shrink-0 text-emerald-500" />
              <span class="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{{ file.name }}</span>
            </span>
            <span class="mt-1 block truncate pl-6 font-mono text-[10px] text-gray-400">{{ file.path }}</span>
            <span v-if="file.note" class="mt-2 block truncate pl-6 text-xs text-gray-500">{{ file.note }}</span>
            <span v-if="file.tags.length" class="mt-2 flex flex-wrap gap-1 pl-6">
              <span v-for="tag in file.tags.slice(0, 4)" :key="tag" class="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800">#{{ tag }}</span>
            </span>
          </button>
        </div>
        <div v-else class="flex flex-1 items-center justify-center p-6 text-center text-xs text-gray-500">
          {{ files.length ? t('notesNoMatch') : t('notesEmpty') }}
        </div>
      </section>

      <section class="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900/60 md:p-6">
        <template v-if="activeFile">
          <div class="mb-6 min-w-0 border-b border-gray-100 pb-4 dark:border-gray-800">
            <p class="mb-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600">{{ activeFile.extension.toUpperCase() }}</p>
            <h2 class="break-words text-lg font-semibold text-gray-900 dark:text-gray-100">{{ activeFile.name }}</h2>
            <p class="mt-1 break-all font-mono text-xs text-gray-400">{{ activeFile.path }}</p>
          </div>

          <div class="mb-6">
            <div class="mb-2 flex items-center justify-between">
              <h3 class="text-xs font-bold uppercase tracking-wide text-gray-500">{{ t('attachedNote') }}</h3>
              <span v-if="saveError" class="text-xs text-rose-500">{{ t('noteSaveError') }}</span>
            </div>
            <textarea v-model="noteDraft" :placeholder="t('notePlaceholder')" class="min-h-48 w-full resize-y rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm leading-relaxed outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 dark:border-gray-700 dark:bg-gray-800" />
          </div>

          <div>
            <div class="mb-2 flex items-center justify-between">
              <h3 class="text-xs font-bold uppercase tracking-wide text-gray-500">{{ t('fileTags') }}</h3>
              <button v-if="!tagInputOpen" type="button" class="rounded-lg border border-dashed border-gray-300 px-2.5 py-1 text-xs text-gray-500 hover:border-emerald-500 hover:text-emerald-600 dark:border-gray-700" @click="tagInputOpen = true">+ {{ t('addTag') }}</button>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span v-for="tag in activeFile.tags" :key="tag" class="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-700 dark:text-emerald-300">
                #{{ tag }}
                <button type="button" class="rounded p-0.5 text-emerald-700/60 hover:text-rose-500 dark:text-emerald-300/60" :aria-label="`${t('removeTag')}: ${tag}`" @click="deleteTag(tag)"><Icon name="lucide:x" size="12" /></button>
              </span>
              <form v-if="tagInputOpen" class="flex items-center gap-1" @submit.prevent="saveTag">
                <input v-model="tagDraft" autofocus maxlength="40" :placeholder="t('tagPlaceholder')" class="w-36 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-emerald-500 dark:border-gray-700 dark:bg-gray-900">
                <button type="submit" class="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs text-white">{{ t('saveTag') }}</button>
                <button type="button" class="rounded-lg px-2 py-1.5 text-xs text-gray-500" @click="tagInputOpen = false; tagDraft = ''">{{ t('cancel') }}</button>
              </form>
              <p v-if="!activeFile.tags.length && !tagInputOpen" class="text-xs text-gray-400">—</p>
            </div>
          </div>
        </template>
        <div v-else class="flex min-h-64 items-center justify-center text-center text-sm text-gray-500">{{ t('notesSelectFile') }}</div>
      </section>
    </div>
  </section>
</template>
