<script setup lang="ts">
import { useAiChats } from '~/composables/useAiChats'
import { useFilePrompts } from '~/composables/useFilePrompts'
import { creatableFileTypes } from '~/composables/useFileTypes'
import type { AiFileCreationRequest } from '~/composables/useAi'
import type { ChatMessage, LocalFile } from '~/types/file'
import type { ComponentPublicInstance } from 'vue'
import type { RequestProvider } from '../../src/services/localProviders'
import { canEditAiFile } from '~/utils/aiArtifacts'

const { files, folders, selectedFolder, activeFile, createVirtualFolder } = useFiles()
const attachedIds = useState<number[]>('ai-attached-document-ids', () => [])
const { activeChatId, chats, newChat, selectChat } = useAiChats(attachedIds)
const outputFolder = ref<string | null>(null)
const { busy: generatingImage, stop: stopComfyGeneration } = useComfy()
const comfyModalOpen = ref(false)
const fileCreationModalOpen = ref(false)
const fileCreationPrompt = ref('')
const fileCreationName = ref('untitled')
const fileCreationExtension = ref('md')
const fileCreationFolder = ref<string | null>(null)
const fileCreationError = ref('')
const fileCreationSubmitting = ref(false)
const imageGenerationPrompt = ref('')
const imageGenerationAutoStart = ref(false)
const documentAttachments = ref<{ open: () => void; openComputerPicker: () => void } | null>(null)
const editFileSelectionPending = ref(false)
const imageGenerationContext = ref('')
const imageGenerationNeedsRefinement = ref(false)
const allowFileEdits = ref(false)
const editPermission = () => {
  const signature = () => (attachedFiles.value).map(file => file.id).sort((a, b) => a - b).join(',')
  const authorizedSelection = signature()
  return () => allowFileEdits.value && signature() === authorizedSelection
}
const attachedFiles = computed(() => files.value.filter(file => attachedIds.value.includes(file.id)))
const { messages, isThinking, generationFeedback, lastError, modelReady, isModelEnabled, activeModelConfig, requestProvider, connections, pendingFileEdits, confirmPendingFileEdit, dismissPendingFileEdit, testConnection, ask, cancel, clear } = useAi(attachedFiles, activeChatId)
const { settings } = useSettings()
const { t } = useLanguage()

const drafts = useState<Record<string, string>>('ai-chat-drafts', () => ({}))
const question = computed({
  get: () => drafts.value[activeChatId.value ?? 'general'] ?? '',
  set: value => { drafts.value[activeChatId.value ?? 'general'] = value },
})
const showFilePreview = useState('show-file-preview', () => false)
const chatSidebarVisible = useState('ai-chat-sidebar-visible', () => true)
watch(activeChatId, () => {
  allowFileEdits.value = false
  outputFolder.value = null
  lastError.value = ''
  showFilePreview.value = false
}, { flush: 'sync' })
const messageIds = new WeakMap<ChatMessage, string>()
let nextMessageId = 0
const messageId = (message: ChatMessage) => {
  let id = messageIds.get(message)
  if (!id) { id = `message-${++nextMessageId}`; messageIds.set(message, id) }
  return id
}
const chatMessages = computed(() => {
  const items = messages.value.map(message => ({
    id: messageId(message),
    role: message.sender === 'user' ? 'user' as const : 'assistant' as const,
    parts: [{ type: 'text' as const, text: message.text }],
  }))
  if (isThinking.value && generationFeedback.value?.text) items.push({ id: 'pending-response', role: 'assistant', parts: [] })
  return items
})
const chatStatus = computed(() => {
  if (isThinking.value && generationFeedback.value) return generationFeedback.value.text ? 'streaming' : 'submitted'
  return generatingImage.value ? 'submitted' : 'ready'
})
const selectChatModel = (provider: RequestProvider, model: string) => {
  requestProvider.value = provider
  activeModelConfig.value.model = model
}

const samplePrompts = useFilePrompts(attachedFiles)

const stripFileCreationCommand = (value: string) => value.trim()
  .replace(/^\s*(?:please\s+)?(?:create|make|write|generate|save)\s+(?:me\s+)?(?:(?:a|an|the)\s+)?(?:new\s+)?file\b(?:\s+(?:named|called)\s+[\w.-]+)?\s*[:,-]?\s*/i, '')
  .replace(/^\s*(?:пожалуйста[,]?\s*)?(?:создай|создать|напиши|написать|сгенерируй|сгенерировать|сохрани|сохранить|сделай|подготовь)\s+(?:мне\s+)?(?:новый\s+)?файл\b(?:\s+(?:с\s+именем|назови)\s+[\w.-]+)?\s*[:,-]?\s*/iu, '')
  .trim()

const inferFileExtension = (prompt: string) => {
  const patterns: Array<[RegExp, string]> = [
    [/(?:c\+\+|\bcpp\b|си\s*плюс\s*плюс)/iu, 'cpp'],
    [/(?:\bc\b|язык\s+c\b)/iu, 'c'],
    [/(?:typescript|\bts\b|тайпскрипт)/iu, 'ts'],
    [/(?:javascript|\bjs\b|джаваскрипт)/iu, 'js'],
    [/(?:python|питон)/iu, 'py'],
    [/(?:java|джава)/iu, 'java'],
    [/(?:shell\s+script|bash|оболоч\w*\s+скрипт)/iu, 'sh'],
    [/(?:\bsql\b|sql)/iu, 'sql'],
    [/(?:\bjson\b|json)/iu, 'json'],
    [/(?:\bhtml\b|html)/iu, 'html'],
    [/(?:\bcss\b|css)/iu, 'css'],
    [/(?:\bpdf\b|пдф)/iu, 'pdf'],
    [/(?:\bdocx\b|word|ворд)/iu, 'docx'],
    [/(?:\bcsv\b|spreadsheet|таблиц\w*)/iu, 'csv'],
  ]
  return patterns.find(([pattern]) => pattern.test(prompt))?.[1] ?? 'md'
}

const openFileCreation = () => {
  fileCreationPrompt.value = stripFileCreationCommand(question.value)
  fileCreationName.value = 'untitled'
  fileCreationExtension.value = inferFileExtension(fileCreationPrompt.value)
  fileCreationError.value = ''
  if (!folders.value.length) createVirtualFolder('Workspace')
  fileCreationFolder.value = outputFolder.value && folders.value.some(folder => folder.path === outputFolder.value)
    ? outputFolder.value
    : folders.value.find(folder => (folder.path === selectedFolder.value || folder.name === selectedFolder.value))?.path ?? folders.value[0]?.path ?? null
  fileCreationModalOpen.value = true
}

const submitFileCreation = async () => {
  if (fileCreationSubmitting.value || isThinking.value || generatingImage.value) return
  const prompt = stripFileCreationCommand(fileCreationPrompt.value)
  const name = fileCreationName.value.trim().replace(new RegExp(`\\.${fileCreationExtension.value}$`, 'i'), '')
  const folderPath = fileCreationFolder.value
  if (!prompt || !name || !folderPath) {
    fileCreationError.value = t(!prompt ? 'filePromptRequired' : !name ? 'fileNameRequired' : 'outputFolderUnavailable')
    return
  }
  const request: AiFileCreationRequest = { name, extension: fileCreationExtension.value, folderPath }
  fileCreationSubmitting.value = true
  fileCreationModalOpen.value = false
  question.value = ''
  try { await ask(prompt, attachedFiles.value, folderPath, editPermission(), () => outputFolder.value, request) }
  finally { fileCreationSubmitting.value = false }
}


watch(() => activeFile.value?.id, (id) => {
  if (id && !attachedIds.value.length) attachedIds.value = [id]
})

const submit = async (text = question.value) => {
  const value = text.trim()
  if (!value || isThinking.value || generatingImage.value) return
  if (isImageGenerationRequest(value)) {
    openImageGeneration(value, !explicitImageIntent(value) && imageFollowUp(value))
    question.value = ''
    return
  }
  question.value = ''
  await ask(value, attachedFiles.value, outputFolder.value ?? undefined, editPermission(), () => outputFolder.value)
}
const deleteMessage = (index: number) => {
  if (index < 0 || index >= messages.value.length) return
  messages.value.splice(index, 1)
}
const activateImageCommand = () => {
  const current = question.value.trim()
  openImageGeneration(current, Boolean(current) && !explicitImageIntent(current) && imageFollowUp(current), false)
  if (comfyModalOpen.value) question.value = ''
}
const focusComposerInput = () => void nextTick(() => document.querySelector<HTMLTextAreaElement>('[data-chat-composer] textarea, textarea[data-chat-composer]')?.focus())
const activateEditFileCommand = () => {
  lastError.value = ''
  const editable = attachedFiles.value.filter(canEditAiFile)
  if (editable.length === 1) {
    allowFileEdits.value = true
    if (!question.value.trim()) question.value = t('editFilePrompt')
    focusComposerInput()
    return
  }
  editFileSelectionPending.value = true
  documentAttachments.value?.open()
}
const onAttachmentSelectionApplied = (ids: number[]) => {
  if (!editFileSelectionPending.value) return
  editFileSelectionPending.value = false
  const editable = files.value.filter(file => ids.includes(file.id) && canEditAiFile(file))
  if (editable.length !== 1) {
    allowFileEdits.value = false
    lastError.value = t('selectOneFileToEdit')
    return
  }
  allowFileEdits.value = true
  if (!question.value.trim()) question.value = t('editFilePrompt')
  focusComposerInput()
}
const composerCommands = computed(() => [
  { label: t('comfyGenerateFromChat'), icon: 'i-lucide-image-plus', onSelect: activateImageCommand },
  { label: t('createFile'), icon: 'i-lucide-file-plus-2', onSelect: openFileCreation },
  { label: t('editAttachedFile'), icon: 'i-lucide-file-pen-line', onSelect: activateEditFileCommand },
  { label: t('chooseDocuments'), icon: 'i-lucide-folder-open', onSelect: () => documentAttachments.value?.open() },
  { label: t('importFromComputer'), icon: 'i-lucide-upload', onSelect: () => documentAttachments.value?.openComputerPicker() },
])
const explicitImageIntent = (text: string) => {
  const value = text.trim()
  const englishImage = /\b(?:image|picture|illustration|artwork|wallpaper|icon|logo|photo|drawing|portrait|landscape)\b/i.test(value)
  const englishCommand = /\b(?:generate|create|draw|make|paint|design|render|illustrate|sketch)\b/i.test(value)
  const russianImage = /(?:изображени\p{L}*|картин\p{L}*|иллюстраци\p{L}*|арт\p{L}*|обо\p{L}*|иконк\p{L}*|логотип\p{L}*|фото|рисунок\p{L}*|портрет\p{L}*|пейзаж\p{L}*)/iu.test(value)
  const russianCommand = /(?:^|[^\p{L}])(?:сгенерируй|создай|нарисуй|сделай|изобрази|нарисовать|сгенерировать|создание)(?=$|[^\p{L}])/iu.test(value)
  const russianDrawVerb = /(?:^|[^\p{L}])(?:нарисуй|изобрази|набросай)\s+\p{L}/iu.test(value)
  const englishDrawVerb = /\b(?:draw|paint|sketch|illustrate)\s+(?:(?:me|a|an|the)\s+){0,2}[\p{L}\p{N}]/iu.test(value)
  const wantsImage = /\b(?:i want|i'd like|can you|could you|please make|please create)\b/i.test(value) && englishImage
  const russianWantsImage = /(?:^|[^\p{L}])(?:хочу|можешь|можно|пожалуйста)\s+(?:мне\s+)?(?:создать|сделать|нарисовать|сгенерировать)?\s*(?:изображени\p{L}*|картин\p{L}*|иллюстраци\p{L}*|арт\p{L}*|фото|портрет\p{L}*|пейзаж\p{L}*)/iu.test(value)
  return (englishCommand && englishImage) || englishDrawVerb || wantsImage || (russianCommand && russianImage) || russianDrawVerb || russianWantsImage
}
const imageFollowUp = (text: string) => /^(?:please\s+)?(?:make|change|add|remove|use|try|keep|turn|put|with|without)\b/i.test(text.trim()) || /^(?:а\s+)?(?:теперь|сделай|измени|добавь|убери|используй|попробуй|оставь|замени|пусть)(?:\s|$)/iu.test(text.trim())
const isImageGenerationRequest = (text: string) => {
  if (explicitImageIntent(text)) return true
  const recent = messages.value.slice(-8)
  const hasRecentImage = recent.some(message => message.provider === 'comfy')
  const hasRecentImageRequest = recent.some(message => message.sender === 'user' && explicitImageIntent(message.text))
  return (hasRecentImage || hasRecentImageRequest) && imageFollowUp(text)
}
const openImageGeneration = (request: string, refineWithContext = false, autoStart = true) => {
  const prompt = request.trim()
  if (isThinking.value || generatingImage.value) return
  imageGenerationAutoStart.value = autoStart && Boolean(prompt)
  imageGenerationPrompt.value = prompt
  imageGenerationNeedsRefinement.value = refineWithContext
  imageGenerationContext.value = messages.value.slice(-8).map(message => `${message.sender === 'user' ? 'User' : 'Assistant'}: ${message.text}`).join('\n').slice(-12000)
  comfyModalOpen.value = true
}

const askAgain = async (text: string) => {
  await submit(text)
}
const stopCurrentRequest = async () => {
  if (isThinking.value) cancel()
  if (generatingImage.value) await stopComfyGeneration()
}
const focusComposer = (event: MouseEvent) => {
  const target = event.target as Element | null
  if (target?.closest('textarea, button, input, select, a, [role="menuitem"]')) return
  void nextTick(() => document.querySelector<HTMLTextAreaElement>('[data-chat-composer] textarea, textarea[data-chat-composer]')?.focus())
}

const attachDocuments = (added: LocalFile[]) => {
  attachedIds.value = [...new Set([...attachedIds.value, ...added.map(file => file.id)])]
}

const detachDocument = (id: number) => {
  attachedIds.value = attachedIds.value.filter(attachedId => attachedId !== id)
}

</script>

<template>
  <FileDropZone tag="section" class="flex min-h-0 flex-1 flex-col overflow-hidden" @imported="attachDocuments">
    <header class="flex shrink-0 items-center justify-between gap-2 border-b border-surface-200 px-3 py-2.5 sm:px-4 dark:border-surface-800">
      <div class="flex min-w-0 items-center gap-2">
        <button type="button" class="rounded-lg p-2 text-surface-500 transition hover:bg-surface-100 dark:hover:bg-surface-800" :aria-label="chatSidebarVisible ? t('hideChatList') : t('showChatList')" :title="chatSidebarVisible ? t('hideChatList') : t('showChatList')" :aria-pressed="chatSidebarVisible" @click="chatSidebarVisible = !chatSidebarVisible">
          <Icon :name="chatSidebarVisible ? 'lucide:panel-left-close' : 'lucide:panel-left-open'" size="17" />
        </button>
        <div class="min-w-0">
          <h1 class="truncate text-base font-bold text-surface-900 dark:text-surface-100">{{ t('aiAssistantTitle') }}</h1>
          <p class="hidden truncate text-xs text-surface-500 sm:block">{{ t('aiAssistantDescription') }}</p>
        </div>
        <span class="hidden rounded-full px-2 py-1 text-[10px] font-medium sm:inline-flex" :class="modelReady ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'">
          {{ isModelEnabled ? (modelReady ? activeModelConfig.model : t('modelNotConfigured')) : t('modelDisabled') }}
        </span>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <NuxtLink to="/settings" class="rounded-lg p-2 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800" :aria-label="t('settings')" :title="t('settings')"><Icon name="lucide:settings-2" size="16" /></NuxtLink>
        <button type="button" class="rounded-lg p-2 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800" :aria-label="t('clearChat')" :title="t('clearChat')" @click="clear"><Icon name="lucide:trash-2" size="16" /></button>
      </div>
    </header>

    <div class="relative min-h-0 flex-1 overflow-y-auto p-3 sm:p-6">
      <div class="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-6">
      <details class="rounded-xl border border-surface-200 dark:border-surface-800">
        <summary class="cursor-pointer px-3 py-2 text-xs font-medium text-surface-500">{{ t('suggestedActions') }}</summary>
        <div class="space-y-2 p-2 pt-0">
        <button
          v-for="prompt in samplePrompts"
          :key="prompt"
          type="button"
          class="flex w-full items-center justify-between rounded-xl border border-surface-200 bg-surface-50 p-3 text-left text-sm text-surface-700 hover:border-primary-500/50 hover:text-primary-600 dark:border-surface-800 dark:bg-surface-800/40 dark:text-surface-300"
          :disabled="isThinking"
          @click="submit(prompt)"
        >
          {{ prompt }}
          <Icon name="lucide:arrow-up-right" size="16" />
        </button>
        <p class="pt-2 text-xs text-surface-400">{{ settings.modelProvider === 'local' ? t('ollamaHint') : t('globalApiHint') }}</p>
        </div>
      </details>

      <UChatMessages
        :key="activeChatId ?? 'general'"
        :messages="chatMessages"
        :status="chatStatus"
        :should-auto-scroll="true"
        :ui="{ root: 'px-0 gap-5', viewport: 'sticky bottom-4 z-10' }"
      >
        <template #default="{ registerMessageRef }">
        <UChatMessage
          v-for="(message, index) in messages"
          :id="messageId(message)"
          :key="messageId(message)"
          :ref="element => registerMessageRef(messageId(message), element as ComponentPublicInstance | null)"
          :role="message.sender === 'user' ? 'user' : 'assistant'"
          :parts="[{ type: 'text', text: message.text }]"
          :side="message.sender === 'user' ? 'right' : 'left'"
          :variant="message.sender === 'user' ? 'soft' : 'naked'"
          :icon="message.sender === 'ai' ? 'i-lucide-sparkles' : undefined"
          :ui="{ container: 'pb-2', body: 'min-w-0 max-w-full text-sm leading-7', leadingIcon: 'size-5 text-primary-500', ...(message.sender === 'user' ? { body: 'min-w-0 max-w-full rounded-2xl bg-primary-600 px-4 py-3 text-sm leading-7 text-white' } : {}) }"
        >
        <template #body>
        <div v-if="message.sender === 'ai'" class="mb-1 flex items-center gap-1.5 text-[10px] font-bold text-primary-500">
          <Icon name="lucide:bot" size="12" />
          {{ message.provider === 'comfy' ? 'Comfy Desktop' : message.modelProvider === 'ollama' ? 'Ollama' : message.modelProvider === 'lmstudio' ? 'LM Studio (bionic)' : message.modelProvider === 'global' ? t('globalModelOption') : t('localModelOption') }}
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
        <div class="mt-2 flex items-center gap-1.5" :class="message.sender === 'user' ? '' : 'justify-end'">
          <template v-if="message.sender === 'user'">
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-lg border border-white/20 text-white/75 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            :aria-label="t('askAgain')"
            :title="t('askAgain')"
            :disabled="isThinking || generatingImage"
            @click="askAgain(message.text)"
          ><Icon name="lucide:rotate-ccw" size="14" /></button>
          <button
            v-if="messages[index + 1]?.provider === 'comfy'"
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-lg border border-white/20 text-white/75 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            :aria-label="t('comfyRegenerateFromChat')"
            :title="t('comfyRegenerateFromChat')"
            :disabled="isThinking || generatingImage"
            @click="openImageGeneration(message.text)"
          ><Icon name="lucide:image-plus" size="14" /></button>
          </template>
          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-lg border border-current/15 text-current/60 transition hover:bg-black/5 hover:text-current dark:hover:bg-white/5"
            :aria-label="t('deleteMessage')"
            :title="t('deleteMessage')"
            @click="deleteMessage(index)"
          ><Icon name="lucide:trash-2" size="14" /></button>
        </div>
        </template>
        </UChatMessage>
        </template>
        <template #viewport="{ onClick }">
          <UButton icon="i-lucide-arrow-down" color="neutral" variant="outline" class="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full shadow-sm" :aria-label="t('scrollToLatest')" :title="t('scrollToLatest')" @click="onClick" />
        </template>
        <template #indicator>
          <AiGenerationFeedback v-if="isThinking && generationFeedback" :feedback="generationFeedback" />
          <div v-else class="flex items-center gap-2 text-sm text-surface-500" role="status"><Icon name="lucide:loader-circle" size="16" class="motion-safe:animate-spin" />{{ t('comfyGenerateTitle') }}</div>
        </template>
      </UChatMessages>
      <p v-if="lastError && !isThinking" role="alert" class="text-xs text-rose-500">{{ lastError }}</p>
      </div>
    </div>

    <div class="w-full shrink-0 space-y-2 border-t border-surface-200 p-3 sm:p-4 dark:border-surface-800">
      <AiDocumentAttachments ref="documentAttachments" v-model="attachedIds" v-model:output-folder="outputFolder" v-model:allow-edits="allowFileEdits" hide-selection @selection-applied="onAttachmentSelectionApplied" @selection-closed="editFileSelectionPending = false" />
      <div class="flex w-full items-stretch gap-2">
      <UChatPrompt
        v-model="question"
        data-chat-composer
        :placeholder="t('askAnything')"
        :disabled="isThinking"
        :autofocus="false"
        :maxrows="6"
        class="min-w-0 flex-1"
        :ui="{ root: 'min-w-0 rounded-2xl border border-transparent bg-surface-100 shadow-none ring-0 transition-colors focus-within:border-primary-500 focus-within:ring-0 dark:bg-surface-800', body: 'min-w-0 w-full rounded-none! border-0! bg-transparent! shadow-none! ring-0! outline-none! focus-within:ring-0! focus-visible:ring-0!', base: 'min-h-11 rounded-none! border-0! bg-transparent! px-4 py-2 text-sm shadow-none! outline-none! ring-0! focus:outline-none! focus:ring-0! focus-visible:outline-none! focus-visible:ring-0!', footer: 'flex flex-wrap items-center justify-between gap-2 px-2 pb-2' }"
        @click="focusComposer"
        @submit="submit()"
      >
        <template #footer>
        <UDropdownMenu :items="composerCommands" :content="{ align: 'end', side: 'top', sideOffset: 8, collisionPadding: 12 }" :modal="false" :ui="{ content: 'z-[150] min-w-44', item: 'cursor-pointer' }">
          <button
            type="button"
            class="flex h-9 w-9 items-center justify-center rounded-xl text-surface-500 transition hover:bg-surface-200 hover:text-primary-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-surface-700 dark:hover:text-primary-300"
            :disabled="isThinking || generatingImage"
            :aria-label="t('composerCommands')"
            :title="t('composerCommands')"
          ><Icon name="lucide:plus" size="17" /></button>
        </UDropdownMenu>
        <div v-if="attachedFiles.length" class="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:thin]" :aria-label="t('chatAttachments')">
          <span
            v-for="file in attachedFiles"
            :key="file.id"
            class="inline-flex max-w-44 shrink-0 items-center gap-1 rounded-lg border border-surface-300/70 bg-surface-200/70 py-1 pl-2 pr-1 text-[11px] text-surface-700 dark:border-surface-600/70 dark:bg-surface-700/70 dark:text-surface-200"
            :title="file.path"
          >
            <Icon :name="['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg'].includes(file.extension.toLowerCase()) ? 'lucide:image' : 'lucide:file-text'" size="13" class="shrink-0 text-primary-500" />
            <span class="min-w-0 truncate">{{ file.name }}</span>
            <button
              type="button"
              class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-surface-500 transition hover:bg-surface-300 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-surface-600"
              :disabled="isThinking || generatingImage"
              :aria-label="`${t('removeAttachment')}: ${file.name}`"
              :title="t('removeAttachment')"
              @click="detachDocument(file.id)"
            ><Icon name="lucide:x" size="12" /></button>
          </span>
        </div>
        <div class="ml-auto flex min-w-0 items-center gap-1.5">
          <AiModelPicker
            :provider="requestProvider"
            :model="activeModelConfig.model"
            :connections="connections"
            :connect="testConnection"
            :disabled="isThinking || generatingImage"
            @select="selectChatModel"
          />
          <UButton
            v-if="!isThinking && !generatingImage"
            type="submit"
            color="primary"
            variant="solid"
            class="h-9 w-9 justify-center rounded-xl p-0"
            :disabled="!question.trim()"
            :aria-label="t('sendMessage')"
            :title="t('sendMessage')"
          ><Icon name="lucide:send" size="16" /></UButton>
          <UButton
            v-else
            type="button"
            color="error"
            variant="solid"
            class="h-9 w-9 justify-center rounded-xl p-0"
            :aria-label="t('cancelRequest')"
            :title="t('cancelRequest')"
            @click="stopCurrentRequest"
          ><Icon name="lucide:square" size="15" /></UButton>
        </div>
        </template>
      </UChatPrompt>
      </div>
    </div>

    <Transition name="comfy-modal">
      <div v-if="comfyModalOpen" class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6" @click.self="!generatingImage && (comfyModalOpen = false)">
        <section role="dialog" aria-modal="true" :aria-label="t('comfyGenerateTitle')" class="comfy-modal-panel flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-2xl dark:border-surface-700 dark:bg-surface-900" @click.stop>
          <header class="flex shrink-0 items-center justify-between gap-3 border-b border-surface-200 px-4 py-3 dark:border-surface-700">
            <h2 class="truncate text-base font-semibold">{{ t('comfyGenerateTitle') }}</h2>
            <button type="button" class="rounded-lg p-2 text-surface-500 transition hover:bg-surface-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-surface-800" :aria-label="t('close')" :disabled="generatingImage" @click="comfyModalOpen = false"><Icon name="lucide:x" size="18" /></button>
          </header>
          <div class="min-h-0 overflow-y-auto p-3 sm:p-4">
            <ComfyImagePanel modal :auto-start="imageGenerationAutoStart" :refine-initial-prompt="imageGenerationNeedsRefinement" :initial-prompt="imageGenerationPrompt" :conversation-context="imageGenerationContext" :chat-key="activeChatId ?? 'general'" @generation-started="comfyModalOpen = false" />
          </div>
        </section>
      </div>
    </Transition>
    <Transition name="comfy-modal">
      <div v-if="fileCreationModalOpen" class="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6" @click.self="fileCreationModalOpen = false">
        <section role="dialog" aria-modal="true" :aria-label="t('createFileTitle')" class="comfy-modal-panel flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-2xl dark:border-surface-700 dark:bg-surface-900" @click.stop>
          <header class="flex shrink-0 items-center justify-between gap-3 border-b border-surface-200 px-4 py-3 dark:border-surface-700">
            <h2 class="truncate text-base font-semibold">{{ t('createFileTitle') }}</h2>
            <button type="button" class="rounded-lg p-2 text-surface-500 transition hover:bg-surface-100 dark:hover:bg-surface-800" :aria-label="t('close')" @click="fileCreationModalOpen = false"><Icon name="lucide:x" size="18" /></button>
          </header>
          <form class="min-h-0 space-y-3 overflow-y-auto p-4" @submit.prevent="submitFileCreation">
            <label class="block text-xs font-medium text-surface-600 dark:text-surface-300">{{ t('fileCreationPrompt') }}
              <textarea v-model="fileCreationPrompt" rows="5" required autofocus class="mt-1 block w-full resize-y rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-800 outline-none focus:border-primary-500 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100" />
            </label>
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="block text-xs font-medium text-surface-600 dark:text-surface-300">{{ t('fileName') }}
                <input v-model="fileCreationName" required class="mt-1 block w-full rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-800 outline-none focus:border-primary-500 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100">
              </label>
              <label class="block text-xs font-medium text-surface-600 dark:text-surface-300">{{ t('fileType') }}
                <AppDropdown v-model="fileCreationExtension" :options="creatableFileTypes.map(type => ({ value: type.extension, label: `.${type.extension} · ${type.label}` }))" class="mt-1 w-full" />
              </label>
            </div>
            <label class="block text-xs font-medium text-surface-600 dark:text-surface-300">{{ t('targetFolder') }}
              <AppDropdown v-model="fileCreationFolder" :options="folders.map(folder => ({ value: folder.path, label: folder.name }))" :placeholder="t('noFoldersHint')" class="mt-1 w-full" />
            </label>
            <p v-if="fileCreationError" class="text-xs text-rose-500" role="alert">{{ fileCreationError }}</p>
            <footer class="flex justify-end gap-2 border-t border-surface-200 pt-3 dark:border-surface-700">
              <button type="button" class="rounded-xl border border-surface-200 px-3.5 py-2 text-xs text-surface-600 dark:border-surface-700 dark:text-surface-300" @click="fileCreationModalOpen = false">{{ t('cancel') }}</button>
              <button type="submit" class="rounded-xl bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50" :disabled="fileCreationSubmitting || !fileCreationPrompt.trim() || !fileCreationName.trim() || !fileCreationFolder">{{ t('generateFile') }}</button>
            </footer>
          </form>
        </section>
      </div>
    </Transition>
  </FileDropZone>
</template>

<style scoped>
.comfy-modal-enter-active, .comfy-modal-leave-active { transition: opacity 180ms ease; }
.comfy-modal-enter-active .comfy-modal-panel, .comfy-modal-leave-active .comfy-modal-panel { transition: transform 220ms cubic-bezier(.2,.8,.2,1), opacity 180ms ease; }
.comfy-modal-enter-from, .comfy-modal-leave-to { opacity: 0; }
.comfy-modal-enter-from .comfy-modal-panel, .comfy-modal-leave-to .comfy-modal-panel { opacity: 0; transform: translateY(12px) scale(.98); }
@media (prefers-reduced-motion: reduce) { .comfy-modal-enter-active, .comfy-modal-leave-active, .comfy-modal-enter-active .comfy-modal-panel, .comfy-modal-leave-active .comfy-modal-panel { animation: none; transition: none; } }
</style>
