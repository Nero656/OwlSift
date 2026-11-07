<script setup lang="ts">
import { fileViews, type FileView } from '~/utils/fileViews'

const view = defineModel<FileView>({ required: true })
const { t } = useLanguage()
</script>

<template>
  <div class="inline-flex max-w-full flex-wrap gap-0.5 rounded-lg border border-surface-200 p-1 dark:border-surface-700" role="group" :aria-label="t('fileViewLabel')">
    <button
      v-for="option in fileViews"
      :key="option.value"
      type="button"
      class="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-primary-500"
      :class="view === option.value ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400' : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800'"
      :aria-pressed="view === option.value"
      @click="view = option.value"
    >
      <UIcon :name="option.icon" class="size-3.5" />{{ t(option.label) }}
    </button>
  </div>
</template>
