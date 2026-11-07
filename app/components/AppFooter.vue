<script setup lang="ts">
defineProps<{ showFilePreview: boolean }>()
defineEmits<{ showPreview: [] }>()
const { t, language } = useLanguage()
const { isScanning, scanProgress, percentage, refreshScanStatus } = useDocumentScan()
const phaseLabel = computed(() => {
  const scan = scanProgress.value
  if (scan?.phase === 'content') return t('scanContentPhase')
  return scan?.contentProcessed ? t('scanMetadataPhase') + ' · ' + t('scanContentPhase') : t('scanMetadataPhase')
})
const percentLabel = computed(() => percentage.value === null ? '' : new Intl.NumberFormat(language.value, { style: 'percent' }).format(percentage.value / 100))
const progressLinkLabel = computed(() => [t('documentsPage'), phaseLabel.value, percentLabel.value].filter(Boolean).join(' · '))
let timer: ReturnType<typeof setInterval> | undefined

function stopPolling() {
  if (timer) clearInterval(timer)
  timer = undefined
}

onMounted(() => { void refreshScanStatus() })
watch(isScanning, running => {
  stopPolling()
  if (running && window.electron) {
    void refreshScanStatus()
    timer = setInterval(() => { void refreshScanStatus() }, 750)
  }
})
onBeforeUnmount(stopPolling)
</script>

<template>
  <footer v-if="isScanning || !showFilePreview" class="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-surface-200 px-3 py-1 dark:border-surface-800">
    <NuxtLink
      v-if="isScanning"
      to="/documents"
      :aria-label="progressLinkLabel"
      class="flex min-w-28 max-w-56 flex-1 flex-col gap-1 rounded px-1 py-1 text-xs text-surface-600 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary dark:text-surface-300"
    >
      <span class="flex items-center justify-between gap-2">
        <span class="truncate">{{ phaseLabel }}</span>
        <span v-if="percentage !== null" :title="t('scanPercentHint')" class="shrink-0 tabular-nums">{{ percentLabel }}</span>
      </span>
      <UProgress :model-value="percentage" :max="100" size="sm" :ui="{ indicator: 'motion-reduce:animate-none motion-reduce:transition-none' }" />
    </NuxtLink>
    <button
      v-if="!showFilePreview"
      type="button"
      class="ml-auto rounded-lg p-2 text-surface-500 transition hover:bg-surface-100 hover:text-surface-700 dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:text-surface-200"
      :title="t('showPreview')"
      :aria-label="t('showPreview')"
      @click="$emit('showPreview')"
    >
      <Icon name="lucide:panel-right-open" size="18" />
    </button>
  </footer>
</template>
