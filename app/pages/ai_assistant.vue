<script setup lang="ts">
import { useAiChats } from '~/composables/useAiChats'
import { useFilePrompts } from '~/composables/useFilePrompts'
import type { LocalFile } from '~/types/file'

const { files, activeFile } = useFiles()
const attachedIds = useState<number[]>('ai-attached-document-ids', () => [])
const { activeChatId, chats, newChat, selectChat } = useAiChats(attachedIds)
const outputFolder = ref<string | null>(null)
const allowFileEdits = ref(false)
const editPermission = () => {
  const signature = () => (attachedFiles.value).map(file => file.id).sort((a, b) => a - b).join(',')
  const authorizedSelection = signature()
  return () => allowFileEdits.value && signature() === authorizedSelection
}
const attachedFiles = computed(() => files.value.filter(file => attachedIds.value.includes(file.id)))
const { messages, isThinking, generationFeedback, lastQuestion, lastError, modelReady, isModelEnabled, activeModelConfig, connectionStatus, availableModels, testConnection, ask, cancel, repeatLast, clear } = useAi(attachedFiles, activeChatId)
const { settings } = useSettings()
const { t } = useLanguage()

const drafts = useState<Record<string, string>>('ai-chat-drafts', () => ({}))
const question = computed({
  get: () => drafts.value[activeChatId.value ?? 'general'] ?? '',
  set: value => { drafts.value[activeChatId.value ?? 'general'] = value },
})
const showFilePreview = useState('show-file-preview', () => false)
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

const samplePrompts = useFilePrompts(attachedFiles)


watch(() => activeFile.value?.id, (id) => {
  if (id && !attachedIds.value.length) attachedIds.value = [id]
})

const submit = async (text = question.value) => {
  const value = text.trim()
  if (!value || isThinking.value) return
  question.value = ''
  await ask(value, attachedFiles.value, outputFolder.value ?? undefined, editPermission(), () => outputFolder.value)
}

const askAgain = async () => {
  await repeatLast(attachedFiles.value, outputFolder.value ?? undefined, editPermission(), () => outputFolder.value)
}

const attachDocuments = (added: LocalFile[]) => {
  attachedIds.value = [...new Set([...attachedIds.value, ...added.map(file => file.id)])]
}

const connectModels = async () => {
  if (!isModelEnabled.value || !activeModelConfig.value.endpoint.trim() || isConnecting.value) return
  isConnecting.value = true
  try { await testConnection() } catch { /* The composable exposes the error. */ }
  finally { isConnecting.value = false }
}

onMounted(() => { void connectModels() })
</script>

<template>
  <FileDropZone tag="section" class="flex min-h-0 flex-1 flex-col overflow-hidden" @imported="attachDocuments">
    <header class="max-h-[40dvh] min-h-0 shrink-0 overflow-y-auto overscroll-contain border-b border-surface-200 px-5 py-4 [scrollbar-gutter:stable] dark:border-surface-800">
      <AiChatSwitcher :chats="chats" :active-key="activeChatId" @select="selectChat" @new="newChat" />
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold text-surface-900 dark:text-surface-100">{{ t('aiAssistantTitle') }}</h1>
          <p class="mt-1 max-w-2xl text-sm text-surface-500">{{ t('aiAssistantDescription') }}</p>
        </div>
        <div class="flex items-center gap-2">
          <span
            class="rounded-full px-2.5 py-1 text-[11px] font-medium"
            :class="modelReady ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'"
          >
            {{ isModelEnabled ? (modelReady ? `${t('modelReady')}: ${activeModelConfig.model}` : t('modelNotConfigured')) : t('modelDisabled') }}
          </span>
          <NuxtLink to="/settings" class="rounded-lg border border-surface-200 px-2.5 py-1.5 text-xs text-surface-600 hover:bg-surface-50 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800">{{ t('settings') }}</NuxtLink>
          <button type="button" class="rounded-lg px-2.5 py-1.5 text-xs text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800" @click="clear">{{ t('clearChat') }}</button>
        </div>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <label v-if="connectionStatus === 'ok'" class="flex min-w-0 items-center gap-2 text-xs text-surface-500">
          <span>{{ t('chatModel') }}</span>
          <AppDropdown v-model="selectedModel" :options="availableModels.map(value => ({ value, label: value }))" :placeholder="availableModels.length ? t('selectModel') : t('noModelsFound')" :disabled="availableModels.length === 0" class="max-w-xs" />
        </label>
        <button v-else type="button" class="rounded-lg border border-surface-200 px-2.5 py-1.5 text-xs text-surface-600 transition hover:bg-surface-50 disabled:opacity-50 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800" :disabled="!isModelEnabled || isConnecting" @click="connectModels">
          {{ isConnecting ? t('sqliteChecking') : (settings.modelProvider === 'local' ? t('connectLmStudio') : t('testConnection')) }}
        </button>
        <AiDocumentAttachments v-model="attachedIds" />
        <AiOutputSettings v-model="outputFolder" v-model:allow-edits="allowFileEdits" :selected-files="attachedFiles" />
      </div>
    </header>

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
      <ComfyImagePanel :chat-key="activeChatId ?? 'general'" />
      <div class="space-y-2">
        <p class="text-[11px] font-semibold uppercase tracking-wider text-surface-400">{{ t('suggestedActions') }}</p>
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
        <AiCreatedFiles :files="message.attachments ?? []" :title="t('chatAttachments')" />
        <AiCreatedFiles :files="message.createdFiles ?? []" />
        <AiCreatedFiles :files="message.editedFiles ?? []" :title="t('editedDocuments')" />
      </div>

      <AiGenerationFeedback v-if="isThinking && generationFeedback" :feedback="generationFeedback" />
      <p v-if="lastError && !isThinking" class="text-xs text-rose-500">{{ lastError }}</p>
    </div>

    <div v-if="isThinking || lastQuestion" class="flex shrink-0 justify-end gap-2 border-t border-surface-200 px-4 pt-3 dark:border-surface-800">
      <button
        v-if="lastQuestion && !isThinking"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-xl border border-surface-200 px-3 py-2 text-xs text-surface-600 transition hover:bg-surface-50 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800"
        @click="askAgain"
      >
        <Icon name="lucide:rotate-ccw" size="14" />
        {{ t('askAgain') }}
      </button>
      <button
        v-if="isThinking"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-600 transition hover:bg-rose-500/20 dark:text-rose-400"
        @click="cancel"
      >
        <Icon name="lucide:square" size="13" />
        {{ t('cancelRequest') }}
      </button>
    </div>
    <form class="flex w-full shrink-0 items-stretch gap-2 p-4" @submit.prevent="submit()">
      <div class="min-w-0 flex-1">
        <input
          v-model="question"
          type="text"
          :placeholder="t('askAnything')"
          :disabled="isThinking"
          class="h-11 w-full rounded-2xl border border-transparent bg-surface-100 px-4 text-sm outline-none focus:border-primary-500 disabled:opacity-50 dark:bg-surface-800"
        >
      </div>
      <button
        type="submit"
        class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-600 text-white transition hover:bg-primary-700 disabled:opacity-40"
        :disabled="!question.trim() || isThinking"
      >
        <Icon name="lucide:send" size="16" />
      </button>
    </form>
  </FileDropZone>
</template>
