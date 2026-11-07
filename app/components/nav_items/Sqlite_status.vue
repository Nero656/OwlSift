<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

interface DatabaseStatus {
  connected: boolean
  fileCount: number
  sizeBytes: number
  fts5Available: boolean
}

const status = ref<DatabaseStatus | null>(null)
const { t, language } = useLanguage()
const { files } = useFiles()
const isElectron = typeof window !== 'undefined' && 'electron' in window
let refreshTimer: ReturnType<typeof setInterval> | undefined

const indexedCount = computed(() => isElectron ? status.value?.fileCount ?? 0 : files.value.length)
const connected = computed(() => isElectron ? status.value?.connected === true : true)
const stateLabel = computed(() => {
  if (!isElectron) return t('browserStorage')
  if (!status.value) return t('sqliteChecking')
  return connected.value ? t('sqliteConnected') : t('sqliteDisconnected')
})
const formattedSize = computed(() => {
  const bytes = status.value?.sizeBytes ?? 0
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
})

async function refreshStatus() {
  if (!isElectron) return

  try {
    status.value = await window.electron.invoke('db:get-status')
  } catch (error) {
    console.error('Could not read SQLite status:', error)
    status.value = { connected: false, fileCount: 0, sizeBytes: 0, fts5Available: false }
  }
}

onMounted(() => {
  void refreshStatus()
  refreshTimer = setInterval(() => void refreshStatus(), 5000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<template>
  <div class="border-t border-surface-200 p-3 dark:border-surface-800">
    <div class="rounded-xl border border-surface-200/50 bg-surface-100/80 p-3 dark:border-surface-700/50 dark:bg-surface-800/50">
      <div class="mb-1 flex items-center justify-between text-xs font-semibold">
        <span>{{ isElectron ? 'SQLite FTS5' : 'OwlSift' }}</span>
        <span
          class="text-[10px]"
          :class="connected ? 'text-primary-500' : 'text-rose-500'"
          role="status"
          aria-live="polite"
        >
          {{ stateLabel }}
        </span>
      </div>

      <p class="text-[11px] leading-relaxed text-surface-500 dark:text-surface-400">
        <template v-if="connected && isElectron">
          {{ formattedSize }} · FTS5 {{ status?.fts5Available ? t('fts5Ready') : t('fts5Unavailable') }}
        </template>
        <template v-else-if="connected && !isElectron">
          {{ t('browserIndexReady') }}
        </template>
        <template v-else-if="!isElectron">
          {{ t('browserIndexReady') }}
        </template>
        <template v-else-if="status">
          {{ t('dbUnavailable') }}
        </template>
        <template v-else>
          {{ t('checkingDb') }}
        </template>
      </p>

      <div v-if="connected" data-testid="indexed-file-count" role="status" aria-live="polite" aria-atomic="true"
        class="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-surface-200 pt-2 text-xs text-surface-600 dark:border-surface-700 dark:text-surface-300">
        <Icon name="lucide:files" size="14" class="shrink-0 text-primary-500" aria-hidden="true" />
        <span>{{ t('indexed') }}</span>
        <strong class="font-semibold tabular-nums text-surface-900 dark:text-surface-100">{{ indexedCount.toLocaleString(language) }}</strong>
        <span>{{ t('files') }}</span>
      </div>
    </div>
  </div>
</template>
