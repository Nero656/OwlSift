<script setup lang="ts">
import type { LanguageKey } from '~/composables/useLanguage'

defineProps<{ feedback: { stage: string; text: string; model: string } }>()
const { t } = useLanguage()
const stages: Record<string, LanguageKey> = {
  preparing: 'generationPreparing', connecting: 'generationConnecting',
  waiting: 'generationWaiting', processing: 'generationProcessing',
  receiving: 'generationReceiving', retrying: 'generationRetrying', proxy: 'generationProxy',
}
</script>

<template>
  <div class="min-w-0 max-w-full rounded-xl border border-primary-500/20 bg-primary-500/5 p-3 text-xs text-surface-600 dark:text-surface-300">
    <div role="status" aria-live="polite" class="flex min-w-0 items-center gap-2">
      <Icon name="lucide:loader-2" size="15" class="shrink-0 animate-spin text-primary-500" />
      <span>{{ t(stages[feedback.stage] || 'generationWaiting') }}</span>
    </div>
    <p class="mt-1 break-all text-[10px] text-surface-500">{{ feedback.model }}</p>
    <template v-if="feedback.text">
      <p class="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed">{{ feedback.text }}</p>
      <p class="mt-2 text-[10px] text-surface-500">{{ feedback.text.length }} {{ t('generationCharacters') }}</p>
    </template>
  </div>
</template>
