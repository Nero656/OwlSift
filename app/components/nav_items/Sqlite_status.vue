<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

interface DatabaseStatus {
  connected: boolean
  fileCount: number
  sizeBytes: number
  fts5Available: boolean
}

const status = ref<DatabaseStatus | null>(null)
const { t } = useLanguage()
const { files } = useFiles()
const isElectron = typeof window !== 'undefined' && 'electron' in window
let refreshTimer: ReturnType<typeof setInterval> | undefined

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
  <div class="border-t border-gray-200 p-3 dark:border-gray-800">
    <div class="rounded-xl border border-gray-200/50 bg-gray-100/80 p-3 dark:border-gray-700/50 dark:bg-gray-800/50">
      <div class="mb-1 flex items-center justify-between text-xs font-semibold">
        <span>{{ isElectron ? 'SQLite FTS5' : 'LocalMind' }}</span>
        <span
          class="text-[10px]"
          :class="connected ? 'text-emerald-500' : 'text-rose-500'"
          role="status"
          aria-live="polite"
        >
          {{ stateLabel }}
        </span>
      </div>

      <p class="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
        <template v-if="connected && isElectron">
          {{ status?.fileCount }} {{ t('indexedFiles') }} · {{ formattedSize }}<br>
          FTS5 {{ status?.fts5Available ? t('fts5Ready') : t('fts5Unavailable') }}
        </template>
        <template v-else-if="connected && !isElectron">
          {{ files.length }} {{ t('indexedFiles') }}<br>
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
    </div>
  </div>
</template>
