<script setup lang="ts">
import AppHeader from './components/AppHeader.vue'
import Sidebar from './components/Sidebar.vue'
import AiPanel from './components/AiPanel.vue'
import CreateFileDialog from './components/CreateFileDialog.vue'

const { loadIndex, selectedFolder, searchQuery, searchIndexedFiles } = useFiles()
const { settings } = useSettings()
const { t } = useLanguage()
const toast = useToast()
const aiResponseReadyNotice = useState<{ id: string; key: string; paths: string[]; fileIds: number[]; response: string } | null>('ai-response-ready-notice', () => null)
const activeChatId = useState<string | null>('ai-active-chat', () => null)
const chatSessions = useState<Record<string, { paths: string[]; createdAt: number; title?: string }>>('ai-chat-sessions', () => ({}))
const attachedIds = useState<number[]>('ai-attached-document-ids', () => [])
const showFilePreview = useState('show-file-preview', () => false)
const route = useRoute()
const settingsTab = useState<string | number>('settings-active-tab', () => 'general')
watch(aiResponseReadyNotice, notice => {
  if (!notice || !settings.value.aiResponseNotifications) return
  if (route.path === '/ai_assistant' && activeChatId.value === notice.key) return
  const description = notice.response.replace(/```[\s\S]*?```/g, '').replace(/\s+/g, ' ').trim().slice(0, 140)
  toast.add({
    title: t('aiResponseReady'),
    description: description || t('aiResponseReady'),
    icon: 'lucide:message-circle',
    color: 'primary',
    duration: settings.value.aiResponseToastDuration,
    onClick: () => {
      chatSessions.value[notice.key] = { ...chatSessions.value[notice.key], paths: notice.paths, createdAt: chatSessions.value[notice.key]?.createdAt || Date.now() }
      activeChatId.value = notice.key
      attachedIds.value = notice.fileIds
      void navigateTo('/ai_assistant')
    },
  })
})
watch([() => route.fullPath, selectedFolder, () => route.path === '/settings' ? settingsTab.value : null], () => { showFilePreview.value = false }, { flush: 'sync' })
watch(() => settings.value.showSystemFiles, async () => {
  await loadIndex()
  await searchIndexedFiles(searchQuery.value)
})
onMounted(() => { void loadIndex() })
</script>

<template>
  <UApp :toaster="{ position: 'bottom-right' }">
  <div class="h-screen overflow-hidden bg-surface-50 text-surface-900 dark:bg-surface-950 dark:text-surface-100">
    <div class="flex h-full flex-col">
      <AppHeader />
      <div class="flex min-h-0 flex-1">
        <Sidebar />
        <main class="flex min-w-0 flex-1 flex-col overflow-hidden bg-white dark:bg-surface-900">
          <div class="flex min-h-0 flex-1 flex-col">
            <NuxtPage />
          </div>
          <div v-if="!showFilePreview" class="flex shrink-0 justify-end border-t border-surface-200 p-2 dark:border-surface-800">
            <button
              type="button"
              class="rounded-lg p-2 text-surface-500 transition hover:bg-surface-100 hover:text-surface-700 dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:text-surface-200"
              :title="t('showPreview')"
              :aria-label="t('showPreview')"
              @click="showFilePreview = true"
            >
              <Icon name="lucide:panel-right-open" size="18" />
            </button>
          </div>
        </main>
        <Transition name="file-preview">
          <div v-if="showFilePreview" class="file-preview-panel h-full shrink-0 overflow-hidden">
            <AiPanel />
          </div>
        </Transition>
      </div>
    </div>
    <CreateFileDialog />
    <FileTransferDialog />
  </div>
  </UApp>
</template>


<style scoped>
.file-preview-panel {
  width: 24rem;
  flex: 0 0 auto;
}

.file-preview-enter-active,
.file-preview-leave-active {
  overflow: hidden;
  transition: width 240ms ease, opacity 180ms ease;
}

.file-preview-enter-from,
.file-preview-leave-to {
  width: 0;
  opacity: 0;
}

.file-preview-enter-to,
.file-preview-leave-from {
  width: 24rem;
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .file-preview-enter-active,
  .file-preview-leave-active {
    transition: none;
  }
}
</style>
