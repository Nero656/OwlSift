<script setup lang="ts">
import { useAiChats } from '~/composables/useAiChats'
import { useFilePrompts } from '~/composables/useFilePrompts'
import { creatableFileTypes } from '~/composables/useFileTypes'
import type { AiFileCreationRequest } from '~/composables/useAi'
import type { LocalFile } from '~/types/file'
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
const imageGenerationPrompt = ref('')
const chatScroll = ref<HTMLElement | null>(null)
const documentAttachments = ref<{ open: () => void; openComputerPicker: () => void } | null>(null)
const editFileSelectionPending = ref(false)
const imageGenerationContext = ref('')
const imageGenerationNeedsRefinement = ref(false)
const chatOpening = ref(false)
const allowFileEdits = ref(false)
const editPermission = () => {
  const signature = () => (attachedFiles.value).map(file => file.id).sort((a, b) => a - b).join(',')
  const authorizedSelection = signature()
  return () => allowFileEdits.value && signature() === authorizedSelection
}
const attachedFiles = computed(() => files.value.filter(file => attachedIds.value.includes(file.id)))
const { messages, isThinking, generationFeedback, lastError, modelReady, isModelEnabled, activeModelConfig, connectionStatus, availableModels, pendingFileEdits, confirmPendingFileEdit, dismissPendingFileEdit, testConnection, ask, cancel, clear } = useAi(attachedFiles, activeChatId)
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
const isConnecting = ref(false)
const selectedModel = computed({
  get: () => activeModelConfig.value.model,
  set: value => { activeModelConfig.value.model = value },
})
const chatModelItems = computed(() => availableModels.value.map(model => ({
  label: model,
  type: 'checkbox' as const,
  checked: selectedModel.value === model,
  onSelect: () => { selectedModel.value = model },
})))

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
    : folders.value.find(folder => folder.name === selectedFolder.value)?.path ?? folders.value[0]?.path ?? null
  fileCreationModalOpen.value = true
}

const submitFileCreation = async () => {
  if (isThinking.value || generatingImage.value) return
  const prompt = stripFileCreationCommand(fileCreationPrompt.value)
  const name = fileCreationName.value.trim().replace(new RegExp(`\\.${fileCreationExtension.value}$`, 'i'), '')
  const folderPath = fileCreationFolder.value
  if (!prompt || !name || !folderPath) {
    fileCreationError.value = t(!prompt ? 'filePromptRequired' : !name ? 'fileNameRequired' : 'outputFolderUnavailable')
    return
  }
  const request: AiFileCreationRequest = { name, extension: fileCreationExtension.value, folderPath }
  fileCreationModalOpen.value = false
  question.value = ''
  await ask(prompt, attachedFiles.value, folderPath, editPermission(), () => outputFolder.value, request)
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
  if (current) {
    openImageGeneration(current, !explicitImageIntent(current) && imageFollowUp(current))
    question.value = ''
  } else {
    question.value = t('createImageCommandPrompt')
  }
  void nextTick(() => document.querySelector<HTMLTextAreaElement>('[data-chat-composer] textarea, textarea[data-chat-composer]')?.focus())
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
const openImageGeneration = (request: string, refineWithContext = false) => {
  const prompt = request.trim()
  if (!prompt || isThinking.value || generatingImage.value) return
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

const scrollChatToBottom = async (behavior: ScrollBehavior = 'smooth') => {
  await nextTick()
  const element = chatScroll.value
  if (element) element.scrollTo({ top: element.scrollHeight, behavior })
}
let chatAnimationTimer: ReturnType<typeof setTimeout> | undefined
watch(activeChatId, async () => {
  chatOpening.value = true
  if (chatAnimationTimer) clearTimeout(chatAnimationTimer)
  await scrollChatToBottom('instant')
  chatAnimationTimer = setTimeout(() => { chatOpening.value = false }, 240)
}, { flush: 'post' })
watch(messages, () => { void scrollChatToBottom() }, { deep: true, flush: 'post' })
onMounted(() => { void connectModels(); void scrollChatToBottom('instant') })

const attachDocuments = (added: LocalFile[]) => {
  attachedIds.value = [...new Set([...attachedIds.value, ...added.map(file => file.id)])]
}

const connectModels = async () => {
  if (!isModelEnabled.value || !activeModelConfig.value.endpoint.trim() || isConnecting.value) return
  isConnecting.value = true
  try { await testConnection() } catch { /* The composable exposes the error. */ }
  finally { isConnecting.value = false }
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

    <div ref="chatScroll" class="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 sm:p-4" :class="{ 'chat-opening': chatOpening }">
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

      <div
        v-for="(message, index) in messages"
        :key="index"
        class="max-w-3xl rounded-2xl p-3 text-sm leading-relaxed"
        :class="message.sender === 'user'
          ? 'ml-auto bg-primary-600 text-white'
          : 'mr-auto border border-surface-200 bg-surface-50 text-surface-800 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-200'"
      >
        <div v-if="message.sender === 'ai'" class="mb-1 flex items-center gap-1.5 text-[10px] font-bold text-primary-500">
          <Icon name="lucide:bot" size="12" />
          {{ message.provider === 'comfy' ? 'Comfy Desktop' : settings.modelProvider === 'global' ? t('globalModelOption') : t('localModelOption') }}
          <span v-if="message.mediaGeneration" class="rounded border border-current/20 px-1.5 py-0.5" :class="message.mediaGeneration.execution === 'local' ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'">{{ t(message.mediaGeneration.execution === 'local' ? 'comfyLocalWorkflow' : message.mediaGeneration.execution === 'cloud' ? 'comfyCloudWorkflow' : 'comfyUnknownWorkflow') }}</span>
        </div>
        <ChatMessageContent :text="message.text" :references="[...(message.createdFiles ?? []), ...(message.editedFiles ?? []), ...(message.attachments ?? [])]" />
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
      </div>

      <AiGenerationFeedback v-if="isThinking && generationFeedback" :feedback="generationFeedback" />
      <p v-if="lastError && !isThinking" class="text-xs text-rose-500">{{ lastError }}</p>
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
        :ui="{ root: 'min-w-0 rounded-2xl border border-transparent bg-surface-100 shadow-none ring-0 transition-colors focus-within:border-primary-500 focus-within:ring-0 dark:bg-surface-800', body: 'min-w-0 w-full rounded-none! border-0! bg-transparent! shadow-none! ring-0! outline-none! focus-within:ring-0! focus-visible:ring-0!', base: 'min-h-11 rounded-none! border-0! bg-transparent! px-4 py-2 text-sm shadow-none! outline-none! ring-0! focus:outline-none! focus:ring-0! focus-visible:outline-none! focus-visible:ring-0!', footer: 'flex items-center justify-between gap-2 px-2 pb-2' }"
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
        <div class="ml-auto flex min-w-0 items-center gap-1.5">
          <UDropdownMenu
            v-if="availableModels.length"
            :items="chatModelItems"
            :content="{ align: 'end', side: 'top', sideOffset: 8, collisionPadding: 12 }"
            :modal="false"
            :ui="{ content: 'z-[150] min-w-52 max-w-[min(24rem,calc(100vw-2rem))] max-h-[min(20rem,var(--reka-dropdown-menu-content-available-height))] overflow-y-auto', item: 'cursor-pointer' }"
          >
            <UButton
              type="button"
              color="neutral"
              variant="ghost"
              size="sm"
              class="max-w-56 min-w-0 gap-1.5 rounded-xl px-2"
              :disabled="isThinking || generatingImage"
              :title="selectedModel || t('selectModel')"
              :aria-label="t('chatModel')"
            >
              <Icon name="lucide:bot" size="15" class="shrink-0 text-primary-500" />
              <span class="min-w-0 truncate text-xs">{{ selectedModel || t('selectModel') }}</span>
              <Icon name="lucide:chevron-down" size="13" class="shrink-0 text-surface-500" />
            </UButton>
          </UDropdownMenu>
          <UButton
            v-else
            type="button"
            color="neutral"
            variant="ghost"
            size="sm"
            class="max-w-56 min-w-0 rounded-xl px-2 text-xs"
            :disabled="!isModelEnabled || isConnecting || connectionStatus === 'ok' || !activeModelConfig.endpoint.trim()"
            :title="isConnecting ? t('sqliteChecking') : connectionStatus === 'ok' ? t('noModelsFound') : (settings.modelProvider === 'local' ? t('connectLmStudio') : t('testConnection'))"
            @click="connectModels"
          >
            <Icon name="lucide:bot" size="15" class="shrink-0 text-primary-500" />
            <span class="truncate">{{ isConnecting ? t('sqliteChecking') : connectionStatus === 'ok' ? t('noModelsFound') : (settings.modelProvider === 'local' ? t('connectLmStudio') : t('testConnection')) }}</span>
          </UButton>
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
            <ComfyImagePanel modal auto-start :refine-initial-prompt="imageGenerationNeedsRefinement" :initial-prompt="imageGenerationPrompt" :conversation-context="imageGenerationContext" :chat-key="activeChatId ?? 'general'" @generation-started="comfyModalOpen = false" />
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
              <button type="submit" class="rounded-xl bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50" :disabled="!fileCreationPrompt.trim() || !fileCreationName.trim() || !fileCreationFolder">{{ t('generateFile') }}</button>
            </footer>
          </form>
        </section>
      </div>
    </Transition>
  </FileDropZone>
</template>

<style scoped>
.chat-opening { animation: chat-open 220ms ease-out both; }
.comfy-modal-enter-active, .comfy-modal-leave-active { transition: opacity 180ms ease; }
.comfy-modal-enter-active .comfy-modal-panel, .comfy-modal-leave-active .comfy-modal-panel { transition: transform 220ms cubic-bezier(.2,.8,.2,1), opacity 180ms ease; }
.comfy-modal-enter-from, .comfy-modal-leave-to { opacity: 0; }
.comfy-modal-enter-from .comfy-modal-panel, .comfy-modal-leave-to .comfy-modal-panel { opacity: 0; transform: translateY(12px) scale(.98); }
@keyframes chat-open { from { opacity: .55; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { .chat-opening, .comfy-modal-enter-active, .comfy-modal-leave-active, .comfy-modal-enter-active .comfy-modal-panel, .comfy-modal-leave-active .comfy-modal-panel { animation: none; transition: none; } }
</style>
