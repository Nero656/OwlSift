<script setup lang="ts">
import { useFilePrompts } from '~/composables/useFilePrompts'
import type { LocalFile } from '~/types/file'

const { activeFile, files, selectedFiles, addTagToFile, updateFileNote, openIndexedFile, showIndexedFileInFolder, deleteIndexedFile, deleteFileFromDisk } = useFiles()
const showFilePreview = useState('show-file-preview', () => false)
const route = useRoute()
const attachedIds = useState<number[]>('ai-attached-document-ids', () => [])
const activeChatId = useState<string | null>('ai-active-chat', () => null)
const ragChatId = computed(() => route.path === '/ai_assistant' ? activeChatId.value : null)
const ragFiles = computed(() => {
  if (route.path === '/') return selectedFiles.value
  if (route.path === '/ai_assistant') return files.value.filter(file => attachedIds.value.includes(file.id))
  return activeFile.value ? [activeFile.value] : []
})

const {
  messages,
  isThinking,
  generationFeedback,
  lastQuestion,
  lastError,
  availableModels,
  pendingFileEdits,
  confirmPendingFileEdit,
  dismissPendingFileEdit,
  connectionStatus,
  activeModelConfig,
  isModelEnabled,
  testConnection,
  ask,
  summarize,
  cancel,
  repeatLast,
  clear,
} = useAi(ragFiles, ragChatId)
const { t } = useLanguage()
const { settings } = useSettings()
const imagePreview = ref<string | null>(null)
const documentPreviewFile = ref<LocalFile | null>(null)
const lastPreviewedFileId = useState<number | null>('last-document-preview-file-id', () => null)
const lastPreviewStorageKey = 'owlsift-last-previewed-file-id'
let imagePreviewRequest = 0

const rightTab = useState<'chat' | 'summary'>('ai-panel-tab', () => 'chat')
const isTagInputOpen = ref(false)
const newTag = ref('')
const tagError = ref('')
const fileActionError = ref('')
const isDeleteDialogOpen = ref(false)
const isDeleting = ref(false)
const deleteDialogAction = ref<'index' | 'disk'>('index')
const deleteMode = ref<'trash' | 'permanent'>('trash')

const userQuery = ref('')
const outputFolder = ref<string | null>(null)
const allowFileEdits = ref(false)
const editPermission = () => {
  const signature = () => ragFiles.value.map(file => file.id).sort((a, b) => a - b).join(',')
  const authorizedSelection = signature()
  return () => allowFileEdits.value && signature() === authorizedSelection
}
const isModelConnecting = ref(false)
const selectedChatModel = computed({
  get: () => activeModelConfig.value.model,
  set: value => { activeModelConfig.value.model = value },
})

const connectChatModel = async () => {
  if (!isModelEnabled.value || !activeModelConfig.value.endpoint.trim() || isModelConnecting.value) return
  isModelConnecting.value = true
  try { await testConnection() } catch { /* The composable exposes the error. */ }
  finally { isModelConnecting.value = false }
}

onMounted(() => { void connectChatModel() })
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

const samplePrompts = useFilePrompts(ragFiles, activeFile)

watch(() => activeFile.value?.id, async (fileId) => {
  const request = ++imagePreviewRequest
  imagePreview.value = null
  isTagInputOpen.value = false
  newTag.value = ''
  tagError.value = ''
  const extension = activeFile.value?.extension.toLowerCase()
  if (!fileId || !extension || !['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif'].includes(extension)) return

  try {
    if (!window.electron) return
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
      !ragFiles.value.length ||
      isThinking.value
  ) {
    return
  }

  const query = userQuery.value

  userQuery.value = ''

  await ask(query, ragFiles.value, outputFolder.value ?? undefined, editPermission(), () => outputFolder.value)
}

const regenerateSummary = async () => {
  if (activeFile.value) await summarize(activeFile.value)
}

const askAgain = async () => {
  await repeatLast(ragFiles.value, outputFolder.value ?? undefined, editPermission(), () => outputFolder.value)
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
  let rememberedId = lastPreviewedFileId.value
  if (!rememberedId && import.meta.client) {
    try {
      const stored = Number(localStorage.getItem(lastPreviewStorageKey))
      if (Number.isSafeInteger(stored) && stored > 0) rememberedId = stored
    } catch { /* The in-memory selection still works if browser storage is unavailable. */ }
  }
  const rememberedFile = rememberedId ? files.value.find(file => file.id === rememberedId) : undefined
  const file = activeFile.value ?? rememberedFile
  if (!file) return
  activeFile.value = file
  fileActionError.value = ''
  documentPreviewFile.value = file
  lastPreviewedFileId.value = file.id
  if (import.meta.client) try { localStorage.setItem(lastPreviewStorageKey, String(file.id)) } catch { /* Keep the current preview available for this session. */ }
}

const openPreviewExternally = async () => {
  const file = documentPreviewFile.value
  if (!file) return
  try {
    await openIndexedFile(file.id)
    documentPreviewFile.value = null
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
  <aside @dragover.prevent @drop.prevent.stop
      class="flex h-full min-h-0 w-96 shrink-0 flex-col
           overflow-hidden border-l border-surface-200
           bg-white/70 backdrop-blur-md
           dark:border-surface-800 dark:bg-surface-900/70"
  >

    <!-- Active file -->

    <div
        v-if="activeFile"
        class="border-b border-surface-200 p-4
             dark:border-surface-800"
    >
      <div
          class="mb-2 flex items-center justify-between"
      >
          <span
            class="flex items-center gap-1 text-[10px]
                 font-bold uppercase tracking-wider
                 text-primary-500"
        >
          <Icon
              name="lucide:cpu"
              size="12"
          />

          {{ t('localRag') }}
        </span>

        <span
            class="text-[11px] text-surface-400"
        >
          {{ activeFile.extension.toUpperCase() }}
          {{ t('file') }}
        </span>
      </div>

      <h2
          class="truncate text-sm font-bold
               text-surface-900 dark:text-surface-100"
      >
        {{ activeFile.name }}
      </h2>

      <p
          class="mt-0.5 truncate font-mono
               text-xs text-surface-400"
      >
        {{ activeFile.path }}
      </p>

      <div class="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg bg-primary-500/10 px-2.5 py-1.5 text-xs font-medium text-primary-700 transition hover:bg-primary-500/20 dark:text-primary-300"
          @click="openSelectedFile"
        >
          <Icon name="lucide:external-link" size="14" />{{ t('openFile') }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg bg-surface-100 px-2.5 py-1.5 text-xs font-medium text-surface-700 transition hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700"
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
          class="mt-3 max-h-64 w-full rounded-xl border border-surface-200/70 bg-surface-50 object-contain dark:border-surface-700 dark:bg-surface-950/40"
      />
    </div>

    <!-- No file -->

    <div
        v-else
        class="border-b border-surface-200 p-6
             text-center dark:border-surface-800"
    >
      <Icon
          name="lucide:mouse-pointer-click"
          size="32"
          class="mx-auto mb-2 text-surface-400"
      />

      <p class="text-xs text-surface-500">
        {{ t('selectFile') }}
      </p>
    </div>

    <!-- Tabs -->

    <div
        class="flex border-b border-surface-200
             text-xs font-medium
             dark:border-surface-800"
    >
      <button
          type="button"
          class="flex-1 border-b-2 py-2.5
               text-center transition-colors"
          :class="
          rightTab === 'chat'
            ? 'border-primary-500 font-semibold text-primary-600 dark:text-primary-400'
            : 'border-transparent text-surface-500 hover:text-surface-800 dark:hover:text-surface-200'
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
            ? 'border-primary-500 font-semibold text-primary-600 dark:text-primary-400'
            : 'border-transparent text-surface-500 hover:text-surface-800 dark:hover:text-surface-200'
        "
          @click="rightTab = 'summary'"
      >
        {{ t('summaryNotes') }}
      </button>
    </div>

      <div class="flex shrink-0 items-center gap-2 border-b border-surface-200 p-2 dark:border-surface-800">
        <label v-if="connectionStatus === 'ok'" class="flex min-w-0 flex-1 items-center gap-2 text-[11px] text-surface-500">
          <span class="shrink-0">{{ t('chatModel') }}</span>
          <AppDropdown v-model="selectedChatModel" :options="availableModels.map(value => ({ value, label: value }))" :placeholder="availableModels.length ? t('selectModel') : t('noModelsFound')" :disabled="availableModels.length === 0" class="min-w-0 flex-1" />
        </label>
        <button v-else type="button" class="w-full rounded-lg border border-surface-200 px-2.5 py-1.5 text-xs text-surface-600 transition hover:bg-surface-50 disabled:opacity-50 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800" :disabled="!isModelEnabled || isModelConnecting" @click="connectChatModel">
          {{ isModelConnecting ? t('sqliteChecking') : (settings.modelProvider === 'local' ? t('connectLmStudio') : t('testConnection')) }}
        </button>
      </div>


    <p class="shrink-0 px-2 py-1 text-xs text-surface-500">{{ t('selectedContextFiles') }} <strong class="text-surface-700 dark:text-surface-200">{{ ragFiles.length }}</strong></p>

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
            class="space-y-2"
        >
          <p
              class="text-[11px] font-semibold
                   uppercase tracking-wider
                   text-surface-400"
          >
            {{ t('suggestedActions') }}
          </p>

          <button
              v-for="prompt in samplePrompts"
              :key="prompt"
              type="button"
              class="group flex w-full items-center
                   justify-between rounded-xl border
                   border-surface-200 bg-surface-50 p-2.5
                   text-left text-xs text-surface-700
                   transition-all
                   hover:border-primary-500/50
                   hover:text-primary-500
                   dark:border-surface-800
                   dark:bg-surface-800/40
                   dark:text-surface-300"
              :disabled="!ragFiles.length || isThinking"
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
              ? 'ml-auto rounded-br-none bg-primary-600 font-medium text-white'
              : 'mr-auto rounded-bl-none border border-surface-200/50 bg-surface-100 text-surface-800 dark:border-surface-700/50 dark:bg-surface-800 dark:text-surface-200'
          "
        >
          <div
              v-if="message.sender === 'ai'"
              class="mb-1 flex items-center gap-1.5
                   text-[10px] font-bold text-primary-500"
          >
            <Icon
                name="lucide:bot"
                size="12"
            />

            {{ message.provider === 'comfy' ? 'Comfy Desktop' : settings.modelProvider === 'global' ? t('globalModelOption') : t('localModelOption') }}
          <span v-if="message.mediaGeneration" class="rounded border border-current/20 px-1.5 py-0.5" :class="message.mediaGeneration.execution === 'local' ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'">{{ t(message.mediaGeneration.execution === 'local' ? 'comfyLocalWorkflow' : message.mediaGeneration.execution === 'cloud' ? 'comfyCloudWorkflow' : 'comfyUnknownWorkflow') }}</span>
          </div>

          <ChatMessageContent :text="message.text" :pending-file="message.pendingEditId ? pendingFileEdits[message.pendingEditId] : undefined" :references="[...(message.createdFiles ?? []), ...(message.editedFiles ?? []), ...(message.attachments ?? [])]" />
          <div v-if="message.sender === 'user' && message.attachments?.length" class="mt-2 flex min-w-0 flex-wrap gap-1.5">
            <ChatFileAttachment v-for="file in message.attachments" :key="file.path ?? file.id" :file="file" :label="file.name" />
          </div>
        <AiCreatedFiles :files="message.createdFiles ?? []" />
        <AiCreatedFiles :files="message.editedFiles ?? []" :title="t('editedDocuments')" />
        <div v-if="message.sender === 'ai' && message.pendingEditId && pendingFileEdits[message.pendingEditId]" class="mt-3 rounded-xl border border-primary-500/30 bg-primary-500/5 p-3">
          <p class="text-xs leading-relaxed">{{ t('confirmSuggestedFileEdit') }} <strong>{{ pendingFileEdits[message.pendingEditId]?.name }}</strong></p>
          <div class="mt-2 flex flex-wrap gap-2">
            <button type="button" class="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50" :disabled="pendingFileEdits[message.pendingEditId]?.applying" @click="confirmPendingFileEdit(message)">
              {{ pendingFileEdits[message.pendingEditId]?.applying ? t('applyingFileEdit') : t('applyFileEdit') }}
            </button>
            <button type="button" class="rounded-lg border border-surface-300 px-3 py-1.5 text-xs text-surface-600 dark:border-surface-600 dark:text-surface-300" :disabled="pendingFileEdits[message.pendingEditId]?.applying" @click="dismissPendingFileEdit(message)">{{ t('keepFileUnchanged') }}</button>
          </div>
        </div>
        </div>

        <!-- Thinking -->

        <AiGenerationFeedback v-if="isThinking && generationFeedback" :feedback="generationFeedback" />

      </div>

      <!-- Input -->

      <div
          class="border-t border-surface-200 bg-white
               p-3 dark:border-surface-800
               dark:bg-surface-900"
      >
        <div v-if="isThinking || lastQuestion" class="mb-2 flex justify-end gap-2">
          <button
              v-if="lastQuestion && !isThinking"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 px-2.5 py-1.5 text-[11px] text-surface-600 transition hover:bg-surface-50 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800"
              @click="askAgain"
          >
            <Icon name="lucide:rotate-ccw" size="13" />
            {{ t('askAgain') }}
          </button>
          <button
              v-if="isThinking"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-medium text-rose-600 transition hover:bg-rose-500/20 dark:text-rose-400"
              @click="cancel"
          >
            <Icon name="lucide:square" size="12" />
            {{ t('cancelRequest') }}
          </button>
        </div>
        <form
            class="flex w-full items-stretch gap-2"
            @submit.prevent="handleSubmit"
        >
          <input
              v-model="userQuery"
              type="text"
              :placeholder="
              ragFiles.length
                ? t('askFile')
                : t('selectFileToAsk')
            "
              :disabled="
              !ragFiles.length ||
              isThinking
            "
              class="h-10 min-w-0 flex-1 rounded-xl border
                   border-transparent
                   bg-surface-100 px-3
                   text-xs outline-none
                   transition
                   focus:border-primary-500
                   disabled:opacity-50
                   dark:bg-surface-800"
          />

          <button
              type="submit"
              :disabled="
              !userQuery.trim() ||
              !ragFiles.length ||
              isThinking
            "
              class="flex h-10 w-10 shrink-0
                   items-center justify-center rounded-xl
                   bg-primary-500
                   text-white transition
                   hover:bg-primary-600
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
                   uppercase text-surface-400"
          >
            {{ t('executiveSummary') }}
          </h4>

          <div
              class="rounded-xl border border-surface-200
                   bg-surface-50 p-3 text-xs
                   leading-relaxed text-surface-700
                   dark:border-surface-800
                   dark:bg-surface-800/50
                   dark:text-surface-300"
          >

            <AiGenerationFeedback v-if="isThinking && generationFeedback" :feedback="generationFeedback" />
            <p v-else class="whitespace-pre-wrap">{{ activeFile.summary || t('generateSummary') }}</p>
            <p v-if="lastError && !isThinking" class="mt-2 text-rose-500">{{ lastError }}</p>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg bg-primary-500/10 px-2.5 py-1.5 font-medium text-primary-600 transition hover:bg-primary-500/20 disabled:opacity-40 dark:text-primary-400"
                  :disabled="isThinking"
                  @click="regenerateSummary"
              >
                <Icon name="lucide:sparkles" size="13" />
                {{ activeFile.summary ? t('regenerateSummary') : t('aiSummary') }}
              </button>
              <button
                  v-if="isThinking"
                  type="button"
                  class="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/10 px-2.5 py-1.5 font-medium text-rose-600 transition hover:bg-rose-500/20 dark:text-rose-400"
                  @click="cancel"
              >
                <Icon name="lucide:square" size="12" />
                {{ t('cancelRequest') }}
              </button>
            </div>
          </div>
        </section>

        <!-- Note -->

        <section>
          <h4
              class="mb-2 mt-4 text-xs font-bold
                   uppercase text-surface-400"
          >
            {{ t('attachedNote') }}
          </h4>

          <textarea
              v-model="activeFile.note"
              :placeholder="t('addNote')"
              class="h-28 w-full resize-none rounded-xl
                   border border-surface-200
                   bg-surface-100 p-3 text-xs
                   outline-none transition
                   focus:ring-2
                   focus:ring-primary-500
                   dark:border-surface-700
                   dark:bg-surface-800"
          />
        </section>

        <!-- Tags -->

        <section>
          <h4
              class="mb-2 mt-4 text-xs font-bold
                   uppercase text-surface-400"
          >
            {{ t('fileTags') }}
          </h4>

          <div class="flex flex-wrap items-center gap-1.5">

            <span
                v-for="tag in activeFile.tags"
                :key="tag"
                class="rounded-lg bg-surface-200
                     px-2.5 py-1 text-xs
                     text-surface-700
                     dark:bg-surface-800
                     dark:text-surface-300"
            >
              #{{ tag }}
            </span>

            <button
                v-if="!isTagInputOpen"
                type="button"
                class="rounded-lg border
                     border-dashed border-surface-300
                     px-2.5 py-1 text-xs
                     text-surface-400 transition
                     hover:text-surface-600
                     dark:border-surface-700
                     dark:hover:text-surface-200"
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
                class="w-28 rounded-lg border border-surface-300 bg-white px-2 py-1 text-xs outline-none focus:border-primary-500 dark:border-surface-700 dark:bg-surface-900"
              >
              <button type="submit" class="rounded-lg bg-primary-600 px-2 py-1 text-xs text-white">{{ t('saveTag') }}</button>
              <button type="button" class="rounded-lg px-1.5 py-1 text-xs text-surface-500" @click="isTagInputOpen = false; newTag = ''">{{ t('cancel') }}</button>
            </form>

          </div>
          <p v-if="tagError" class="mt-2 text-xs text-rose-500">{{ tagError }}</p>
        </section>

      </template>

      <div
          v-else
          class="py-8 text-center text-xs
               text-surface-400"
      >
        {{ t('noActiveFile') }}
      </div>

    </div>

    <div class="flex shrink-0 justify-end border-t border-surface-200 p-2 dark:border-surface-800">
      <button
        type="button"
        class="rounded-lg p-2 text-surface-500 transition hover:bg-surface-100 hover:text-surface-700 dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:text-surface-200"
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
      class="fixed inset-0 z-[100] flex items-center justify-center bg-surface-950/60 p-4 backdrop-blur-sm"
      @click.self="!isDeleting && (isDeleteDialogOpen = false)"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-file-title"
        class="w-full max-w-md rounded-2xl border border-surface-200 bg-white p-5 shadow-2xl dark:border-surface-700 dark:bg-surface-900"
      >
        <div class="mb-4 flex items-start gap-3">
          <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
            <Icon name="lucide:triangle-alert" size="20" />
          </div>
          <div class="min-w-0">
            <h2 id="delete-file-title" class="text-base font-semibold text-surface-900 dark:text-surface-100">{{ deleteDialogAction === 'disk' ? t('deleteDialogTitle') : t('removeFromIndexTitle') }}</h2>
            <p class="mt-1 break-words text-sm text-surface-500">{{ activeFile?.name }}</p>
            <template v-if="deleteDialogAction === 'disk'">
              <p class="mt-1 text-xs text-surface-500">{{ t('deleteDialogMessage') }}</p>
              <label class="mt-3 block text-xs font-medium text-surface-700 dark:text-surface-300">{{ t('deleteMode') }}
                <AppDropdown v-model="deleteMode" :options="[{ value: 'trash', label: t('moveToTrash') }, { value: 'permanent', label: t('deletePermanently') }]" class="mt-1 w-full" />
              </label>
              <p v-if="deleteMode === 'permanent'" class="mt-2 text-xs text-rose-500">{{ t('permanentDeleteWarning') }}</p>
            </template>
            <p v-else class="mt-1 text-xs text-surface-500">{{ t('removeFromIndexMessage') }}</p>
          </div>
        </div>
        <p v-if="fileActionError" class="mt-3 text-xs text-rose-500" role="alert">{{ fileActionError }}</p>

        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-xl border border-surface-200 px-3.5 py-2 text-xs font-medium text-surface-600 transition hover:bg-surface-100 disabled:opacity-50 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800"
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
  <DocumentPreviewModal :file="documentPreviewFile" :open-error="fileActionError" @close="documentPreviewFile = null" @open-external="openPreviewExternally" />
</template>
