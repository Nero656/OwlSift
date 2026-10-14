<script setup lang="ts">
import type { LocalFile } from '~/types/file'

const { activeFile, addTagToFile, updateFileNote, openIndexedFile, showIndexedFileInFolder, deleteIndexedFile, deleteFileFromDisk } = useFiles()
const showFilePreview = useState('show-file-preview', () => true)

const {
  messages,
  isThinking,
  ask,
  clear
} = useAi()
const { t, language } = useLanguage()
const imagePreview = ref<string | null>(null)
let imagePreviewRequest = 0

const rightTab = ref<'chat' | 'summary'>('chat')
const isTagInputOpen = ref(false)
const newTag = ref('')
const tagError = ref('')
const fileActionError = ref('')
const isDeleteDialogOpen = ref(false)
const isDeleting = ref(false)
const deleteDialogAction = ref<'index' | 'disk'>('index')
const deleteMode = ref<'trash' | 'permanent'>('trash')

const userQuery = ref('')
let noteSaveTimer: ReturnType<typeof setTimeout> | undefined
let pendingNoteSave: { fileId: number; note: string } | undefined

const persistPendingNote = async () => {
  if (!pendingNoteSave) return
  const pending = pendingNoteSave
  pendingNoteSave = undefined
  if (noteSaveTimer) clearTimeout(noteSaveTimer)
  noteSaveTimer = undefined
  await updateFileNote(pending.fileId, pending.note)
}

watch(() => activeFile.value?.id, () => { void persistPendingNote() })

watch(() => activeFile.value?.note, (note) => {
  const fileId = activeFile.value?.id
  if (!fileId || note === undefined) return
  pendingNoteSave = { fileId, note }
  if (noteSaveTimer) clearTimeout(noteSaveTimer)
  noteSaveTimer = setTimeout(() => { void persistPendingNote() }, 500)
})

onBeforeUnmount(() => { void persistPendingNote() })

const samplePrompts = computed(() => [t('promptTerms'), t('promptPrices'), t('promptTakeaways')])

watch(() => activeFile.value?.id, async (fileId) => {
  const request = ++imagePreviewRequest
  imagePreview.value = null
  isTagInputOpen.value = false
  newTag.value = ''
  tagError.value = ''
  const extension = activeFile.value?.extension.toLowerCase()
  if (!fileId || !extension || !['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif'].includes(extension)) return

  try {
    const preview = await window.electron.invoke('files:get-image-preview', fileId)
    if (request === imagePreviewRequest) imagePreview.value = preview
  } catch (error) {
    console.warn('Could not load selected image preview:', error)
  }
})

const sendPrompt = async (prompt: string) => {
  userQuery.value = prompt
  await handleSubmit()
}

const handleSubmit = async () => {
  if (
      !userQuery.value.trim() ||
      !activeFile.value ||
      isThinking.value
  ) {
    return
  }

  const query = userQuery.value

  userQuery.value = ''

  await ask(
      activeFile.value,
      query
  )
}

const openSummary = (file: LocalFile) => {
  activeFile.value = file
  rightTab.value = 'summary'
}

const addTag = () => {
  isTagInputOpen.value = true
  tagError.value = ''
}

const saveTag = async () => {
  if (!activeFile.value || !newTag.value.trim()) return
  try {
    await addTagToFile(activeFile.value.id, newTag.value)
    newTag.value = ''
    isTagInputOpen.value = false
    tagError.value = ''
  } catch (error) {
    console.error('Could not save file tag:', error)
    tagError.value = t('tagError')
  }
}

const openSelectedFile = async () => {
  if (!activeFile.value) return
  fileActionError.value = ''
  try {
    await openIndexedFile(activeFile.value.id)
  } catch (error) {
    console.error('Could not open indexed file:', error)
    fileActionError.value = t('fileOpenError')
  }
}

const showSelectedFileInFolder = async () => {
  if (!activeFile.value) return
  fileActionError.value = ''
  try {
    await showIndexedFileInFolder(activeFile.value.id)
  } catch (error) {
    console.error('Could not show indexed file in its folder:', error)
    fileActionError.value = t('fileLocationError')
  }
}

const confirmDeleteFile = async () => {
  const file = activeFile.value
  if (!file || isDeleting.value) return
  isDeleting.value = true
  fileActionError.value = ''
  try {
    await persistPendingNote()
    if (deleteDialogAction.value === 'disk') await deleteFileFromDisk(file.id, deleteMode.value)
    else await deleteIndexedFile(file.id)
    isDeleteDialogOpen.value = false
  } catch (error) {
    console.error('Could not delete indexed file:', error)
    fileActionError.value = t('fileDeleteError')
  } finally {
    isDeleting.value = false
  }
}
</script>

<template>
  <aside
      class="flex h-full min-h-0 w-96 shrink-0 flex-col
           overflow-hidden border-l border-gray-200
           bg-white/70 backdrop-blur-md
           dark:border-gray-800 dark:bg-gray-900/70"
  >

    <!-- Active file -->

    <div
        v-if="activeFile"
        class="border-b border-gray-200 p-4
             dark:border-gray-800"
    >
      <div
          class="mb-2 flex items-center justify-between"
      >
          <span
            class="flex items-center gap-1 text-[10px]
                 font-bold uppercase tracking-wider
                 text-emerald-500"
        >
          <Icon
              name="lucide:cpu"
              size="12"
          />

          {{ t('localRag') }}
        </span>

        <span
            class="text-[11px] text-gray-400"
        >
          {{ activeFile.extension.toUpperCase() }}
          {{ t('file') }}
        </span>
      </div>

      <h2
          class="truncate text-sm font-bold
               text-gray-900 dark:text-gray-100"
      >
        {{ activeFile.name }}
      </h2>

      <p
          class="mt-0.5 truncate font-mono
               text-xs text-gray-400"
      >
        {{ activeFile.path }}
      </p>

      <div class="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-300"
          @click="openSelectedFile"
        >
          <Icon name="lucide:external-link" size="14" />{{ t('openFile') }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          @click="showSelectedFileInFolder"
        >
          <Icon name="lucide:folder-open" size="14" />{{ t('showInFolder') }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-500/20 dark:text-rose-400"
          @click="deleteDialogAction = 'index'; isDeleteDialogOpen = true; fileActionError = ''"
        >
          <Icon name="lucide:folder-minus" size="14" />{{ t('removeFromIndex') }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-rose-700"
          @click="deleteDialogAction = 'disk'; deleteMode = 'trash'; isDeleteDialogOpen = true; fileActionError = ''"
        >
          <Icon name="lucide:trash-2" size="14" />{{ t('deleteFile') }}
        </button>
      </div>
      <p v-if="fileActionError" class="mt-2 text-xs text-rose-500" role="alert">{{ fileActionError }}</p>

      <img
          v-if="imagePreview"
          :src="imagePreview"
          :alt="activeFile.name"
          class="mt-3 max-h-64 w-full rounded-xl border border-gray-200/70 bg-gray-50 object-contain dark:border-gray-700 dark:bg-gray-950/40"
      />
    </div>

    <!-- No file -->

    <div
        v-else
        class="border-b border-gray-200 p-6
             text-center dark:border-gray-800"
    >
      <Icon
          name="lucide:mouse-pointer-click"
          size="32"
          class="mx-auto mb-2 text-gray-400"
      />

      <p class="text-xs text-gray-500">
        {{ t('selectFile') }}
      </p>
    </div>

    <!-- Tabs -->

    <div
        class="flex border-b border-gray-200
             text-xs font-medium
             dark:border-gray-800"
    >
      <button
          type="button"
          class="flex-1 border-b-2 py-2.5
               text-center transition-colors"
          :class="
          rightTab === 'chat'
            ? 'border-emerald-500 font-semibold text-emerald-600 dark:text-emerald-400'
            : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
        "
          @click="rightTab = 'chat'"
      >
        {{ t('aiAssistant') }}
      </button>

      <button
          type="button"
          class="flex-1 border-b-2 py-2.5
               text-center transition-colors"
          :class="
          rightTab === 'summary'
            ? 'border-emerald-500 font-semibold text-emerald-600 dark:text-emerald-400'
            : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
        "
          @click="rightTab = 'summary'"
      >
        {{ t('summaryNotes') }}
      </button>
    </div>

    <!-- CHAT -->

    <div
        v-if="rightTab === 'chat'"
        class="flex min-h-0 flex-1 flex-col"
    >

      <!-- Messages -->

      <div
          class="flex-1 space-y-3 overflow-y-auto p-4"
      >

        <!-- Suggested prompts -->

        <div
            v-if="messages.length === 0"
            class="space-y-2"
        >
          <p
              class="text-[11px] font-semibold
                   uppercase tracking-wider
                   text-gray-400"
          >
            {{ t('suggestedActions') }}
          </p>

          <button
              v-for="prompt in samplePrompts"
              :key="prompt"
              type="button"
              class="group flex w-full items-center
                   justify-between rounded-xl border
                   border-gray-200 bg-gray-50 p-2.5
                   text-left text-xs text-gray-700
                   transition-all
                   hover:border-emerald-500/50
                   hover:text-emerald-500
                   dark:border-gray-800
                   dark:bg-gray-800/40
                   dark:text-gray-300"
              :disabled="!activeFile"
              @click="sendPrompt(prompt)"
          >
            <span>
              {{ prompt }}
            </span>

            <Icon
                name="lucide:arrow-up-right"
                size="14"
                class="opacity-0 transition-opacity
                     group-hover:opacity-100"
            />
          </button>
        </div>

        <!-- Messages -->

        <div
            v-for="(message, index) in messages"
            :key="index"
            class="max-w-[90%] rounded-xl p-3
                 text-xs leading-relaxed"
            :class="
            message.sender === 'user'
              ? 'ml-auto rounded-br-none bg-emerald-600 font-medium text-white'
              : 'mr-auto rounded-bl-none border border-gray-200/50 bg-gray-100 text-gray-800 dark:border-gray-700/50 dark:bg-gray-800 dark:text-gray-200'
          "
        >
          <div
              v-if="message.sender === 'ai'"
              class="mb-1 flex items-center gap-1.5
                   text-[10px] font-bold text-emerald-500"
          >
            <Icon
                name="lucide:bot"
                size="12"
            />

            {{ language === 'ru' ? 'Локальная языковая модель (Ollama)' : 'Local LLM (Ollama)' }}
          </div>

          <p class="whitespace-pre-line">
            {{ message.text }}
          </p>
        </div>

        <!-- Thinking -->

        <div
            v-if="isThinking"
            class="mr-auto flex items-center gap-2
                 rounded-xl rounded-bl-none
                 bg-gray-100 p-3 text-xs
                 text-gray-500
                 dark:bg-gray-800"
        >
          <Icon
              name="lucide:loader-2"
              size="16"
              class="animate-spin text-emerald-500"
          />

          <span>
            {{ t('analyzing') }}
          </span>
        </div>

      </div>

      <!-- Input -->

      <div
          class="border-t border-gray-200 bg-white
               p-3 dark:border-gray-800
               dark:bg-gray-900"
      >
        <form
            class="relative"
            @submit.prevent="handleSubmit"
        >
          <input
              v-model="userQuery"
              type="text"
              :placeholder="
              activeFile
                ? t('askFile')
                : t('selectFileToAsk')
            "
              :disabled="
              !activeFile ||
              isThinking
            "
              class="w-full rounded-xl border
                   border-transparent
                   bg-gray-100 py-2.5 pl-3 pr-10
                   text-xs outline-none
                   transition
                   focus:border-emerald-500
                   disabled:opacity-50
                   dark:bg-gray-800"
          />

          <button
              type="submit"
              :disabled="
              !userQuery.trim() ||
              !activeFile ||
              isThinking
            "
              class="absolute right-2 top-1/2
                   -translate-y-1/2 rounded-lg
                   bg-emerald-500 p-1.5
                   text-white transition
                   hover:bg-emerald-600
                   disabled:opacity-40"
          >
            <Icon
                name="lucide:send"
                size="14"
            />
          </button>
        </form>
      </div>
    </div>

    <!-- SUMMARY -->

    <div
        v-else
        class="flex-1 space-y-4 overflow-y-auto p-4"
    >

      <template v-if="activeFile">

        <!-- Summary -->

        <section>
          <h4
              class="mb-2 text-xs font-bold
                   uppercase text-gray-400"
          >
            {{ t('executiveSummary') }}
          </h4>

          <div
              class="rounded-xl border border-gray-200
                   bg-gray-50 p-3 text-xs
                   leading-relaxed text-gray-700
                   dark:border-gray-800
                   dark:bg-gray-800/50
                   dark:text-gray-300"
          >
            {{
              activeFile.summary ||
              t('generateSummary')
            }}
          </div>
        </section>

        <!-- Note -->

        <section>
          <h4
              class="mb-2 mt-4 text-xs font-bold
                   uppercase text-gray-400"
          >
            {{ t('attachedNote') }}
          </h4>

          <textarea
              v-model="activeFile.note"
              :placeholder="t('addNote')"
              class="h-28 w-full resize-none rounded-xl
                   border border-gray-200
                   bg-gray-100 p-3 text-xs
                   outline-none transition
                   focus:ring-2
                   focus:ring-emerald-500
                   dark:border-gray-700
                   dark:bg-gray-800"
          />
        </section>

        <!-- Tags -->

        <section>
          <h4
              class="mb-2 mt-4 text-xs font-bold
                   uppercase text-gray-400"
          >
            {{ t('fileTags') }}
          </h4>

          <div class="flex flex-wrap items-center gap-1.5">

            <span
                v-for="tag in activeFile.tags"
                :key="tag"
                class="rounded-lg bg-gray-200
                     px-2.5 py-1 text-xs
                     text-gray-700
                     dark:bg-gray-800
                     dark:text-gray-300"
            >
              #{{ tag }}
            </span>

            <button
                v-if="!isTagInputOpen"
                type="button"
                class="rounded-lg border
                     border-dashed border-gray-300
                     px-2.5 py-1 text-xs
                     text-gray-400 transition
                     hover:text-gray-600
                     dark:border-gray-700
                     dark:hover:text-gray-200"
                @click="addTag"
            >
              + {{ t('addTag') }}
            </button>

            <form v-if="isTagInputOpen" class="flex items-center gap-1" @submit.prevent="saveTag">
              <input
                v-model="newTag"
                autofocus
                maxlength="40"
                :placeholder="t('tagPlaceholder')"
                class="w-28 rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs outline-none focus:border-emerald-500 dark:border-gray-700 dark:bg-gray-900"
              >
              <button type="submit" class="rounded-lg bg-emerald-600 px-2 py-1 text-xs text-white">{{ t('saveTag') }}</button>
              <button type="button" class="rounded-lg px-1.5 py-1 text-xs text-gray-500" @click="isTagInputOpen = false; newTag = ''">{{ t('cancel') }}</button>
            </form>

          </div>
          <p v-if="tagError" class="mt-2 text-xs text-rose-500">{{ tagError }}</p>
        </section>

      </template>

      <div
          v-else
          class="py-8 text-center text-xs
               text-gray-400"
      >
        {{ t('noActiveFile') }}
      </div>

    </div>

    <div class="flex shrink-0 justify-end border-t border-gray-200 p-2 dark:border-gray-800">
      <button
        type="button"
        class="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        :title="t('hidePreview')"
        :aria-label="t('hidePreview')"
        @click="showFilePreview = false"
      >
        <Icon name="lucide:panel-right-close" size="18" />
      </button>
    </div>
  </aside>

  <Teleport to="body">
    <div
      v-if="isDeleteDialogOpen"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-sm"
      @click.self="!isDeleting && (isDeleteDialogOpen = false)"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-file-title"
        class="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      >
        <div class="mb-4 flex items-start gap-3">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
            <Icon name="lucide:triangle-alert" size="20" />
          </div>
          <div class="min-w-0">
            <h2 id="delete-file-title" class="text-base font-semibold text-gray-900 dark:text-gray-100">{{ deleteDialogAction === 'disk' ? t('deleteDialogTitle') : t('removeFromIndexTitle') }}</h2>
            <p class="mt-1 break-words text-sm text-gray-500">{{ activeFile?.name }}</p>
            <template v-if="deleteDialogAction === 'disk'">
              <p class="mt-1 text-xs text-gray-500">{{ t('deleteDialogMessage') }}</p>
              <label class="mt-3 block text-xs font-medium text-gray-700 dark:text-gray-300">{{ t('deleteMode') }}
                <select v-model="deleteMode" class="mt-1 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-800">
                  <option value="trash">{{ t('moveToTrash') }}</option>
                  <option value="permanent">{{ t('deletePermanently') }}</option>
                </select>
              </label>
              <p v-if="deleteMode === 'permanent'" class="mt-2 text-xs text-rose-500">{{ t('permanentDeleteWarning') }}</p>
            </template>
            <p v-else class="mt-1 text-xs text-gray-500">{{ t('removeFromIndexMessage') }}</p>
          </div>
        </div>
        <p v-if="fileActionError" class="mt-3 text-xs text-rose-500" role="alert">{{ fileActionError }}</p>

        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-xl border border-gray-200 px-3.5 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            :disabled="isDeleting"
            @click="isDeleteDialogOpen = false"
          >{{ t('cancel') }}</button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
            :disabled="isDeleting"
            @click="confirmDeleteFile"
          >
            <Icon v-if="isDeleting" name="lucide:loader-2" size="14" class="animate-spin" />
            {{ deleteDialogAction === 'disk' ? t('confirmDelete') : t('removeFromIndex') }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
