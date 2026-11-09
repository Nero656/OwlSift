<script setup lang="ts">
import AppHeader from './components/AppHeader.vue'
import Sidebar from './components/Sidebar.vue'

const { ensureIndex, loadIndex, selectedFolder, searchQuery, searchIndexedFiles, isCreateFileOpen, fileTransferRequest } = useFiles()
const mountCreateDialog = computed<boolean>(opened => Boolean(opened || isCreateFileOpen.value))
const mountTransferDialog = computed<boolean>(opened => Boolean(opened || fileTransferRequest.value))
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
onMounted(() => { void ensureIndex().catch(error => console.error('Could not load file index:', error)) })
</script>

<template>
  <UApp :toaster="{ position: 'bottom-right' }">
  <NuxtLoadingIndicator :throttle="120" />
  <div class="h-screen overflow-hidden bg-surface-50 text-surface-900 dark:bg-surface-950 dark:text-surface-100">
    <div class="flex h-full flex-col">
      <AppHeader />
      <div class="relative flex min-h-0 flex-1">
        <Sidebar />
        <main class="flex min-w-0 flex-1 flex-col overflow-hidden bg-white dark:bg-surface-900">
          <div class="flex min-h-0 flex-1 flex-col">
            <NuxtPage />
          </div>
          <AppFooter :show-file-preview="showFilePreview" @show-preview="showFilePreview = true" />
        </main>
        <Transition
          name="file-preview"
          @before-enter="panel => panel.removeAttribute('inert')"
          @before-leave="panel => panel.setAttribute('inert', '')"
        >
          <div v-if="showFilePreview" class="file-preview-panel h-full shrink-0 overflow-hidden">
            <Suspense>
              <LazyAiPanel />
              <template #fallback>
                <div class="space-y-4 p-4" aria-hidden="true">
                  <USkeleton class="h-8 w-2/3 motion-reduce:animate-none" />
                  <USkeleton class="h-32 w-full motion-reduce:animate-none" />
                </div>
              </template>
            </Suspense>
          </div>
        </Transition>
      </div>
    </div>
    <LazyCreateFileDialog v-if="mountCreateDialog" />
    <LazyFileTransferDialog v-if="mountTransferDialog" />
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
  transition: transform 180ms ease-out, opacity 160ms ease-out;
}

.file-preview-leave-active {
  position: absolute;
  inset-block: 0;
  inset-inline-end: 0;
  z-index: 10;
  pointer-events: none;
}

.file-preview-enter-from,
.file-preview-leave-to {
  opacity: 0;
  transform: translateX(1.25rem);
}

.file-preview-enter-from:dir(rtl),
.file-preview-leave-to:dir(rtl) {
  transform: translateX(-1.25rem);
}

@media (prefers-reduced-motion: reduce) {
  .file-preview-enter-active,
  .file-preview-leave-active {
    transition: none;
  }
}
</style>
