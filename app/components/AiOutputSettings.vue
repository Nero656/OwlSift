<script setup lang="ts">
import type { LocalFile } from '~/types/file'
import { canEditAiFile } from '~/utils/aiArtifacts'
const model = defineModel<string | null>({ default: null })
const allowEdits = defineModel<boolean>('allowEdits', { default: false })
const props = withDefaults(defineProps<{ selectedFiles?: LocalFile[] }>(), { selectedFiles: () => [] })
const { folders, selectedFolder } = useFiles()
const { t } = useLanguage()
const editableCount = computed(() => props.selectedFiles.filter(canEditAiFile).length)
const normalize = (path: string) => path.replace(/\\/g, '/')
const suggestedFolder = computed(() => {
  const common = props.selectedFiles.length ? folders.value.filter(folder => props.selectedFiles.every(file => normalize(file.path).startsWith(normalize(folder.path) + '/'))).sort((a, b) => b.path.length - a.path.length)[0] : undefined
  return common ?? folders.value.find(folder => folder.name === selectedFolder.value) ?? folders.value[0]
})
const enabled = computed({
  get: () => model.value !== null,
  set: value => { model.value = value ? suggestedFolder.value?.path ?? null : null },
})
watch(folders, value => { if (model.value && !value.some(folder => folder.path === model.value)) model.value = null })
// Permission applies to this selection only and must be granted again for a new selection.
watch(() => props.selectedFiles.map(file => file.id).sort((a, b) => a - b).join(','), () => { allowEdits.value = false }, { flush: 'sync' })
</script>
<template>
  <div class="flex min-w-0 flex-col gap-2 text-xs text-surface-500">
    <p>{{ t('selectedContextFiles') }} <strong class="text-surface-700 dark:text-surface-200">{{ selectedFiles.length }}</strong></p>
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      <label class="flex items-center gap-2"><input v-model="enabled" type="checkbox" :disabled="!folders.length">{{ t('allowFileCreation') }}</label>
      <label v-if="enabled" class="flex min-w-0 items-center gap-2">{{ t('outputFolder') }}
        <AppDropdown v-model="model" :options="folders.map(folder => ({ value: folder.path, label: folder.name }))" class="min-w-0 max-w-52" />
      </label>
    </div>
    <label class="flex items-center gap-2"><input v-model="allowEdits" type="checkbox" :disabled="!editableCount">{{ t('allowFileEditing') }}</label>
    <p v-if="selectedFiles.length" class="text-[11px]">{{ t('editableContextFiles') }} {{ editableCount }} {{ t('ofFiles') }} {{ selectedFiles.length }}</p>
    <p v-if="selectedFiles.length && !editableCount" class="text-[11px] leading-relaxed">{{ t('noEditableContextFiles') }}</p>
    <p v-if="allowEdits" class="max-w-xl text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">{{ t('fileEditingHint') }}</p>
  </div>
</template>
