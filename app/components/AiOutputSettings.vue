<script setup lang="ts">
const model = defineModel<string | null>({ default: null })
const { folders } = useFiles()
const { t } = useLanguage()
const enabled = computed({
  get: () => model.value !== null,
  set: value => { model.value = value ? folders.value[0]?.path ?? null : null },
})
watch(folders, value => { if (model.value && !value.some(folder => folder.path === model.value)) model.value = null })
</script>
<template>
  <div class="flex min-w-0 flex-wrap items-center gap-2 text-xs text-gray-500">
    <label class="flex items-center gap-2"><input v-model="enabled" type="checkbox" :disabled="!folders.length">{{ t('allowFileCreation') }}</label>
    <label v-if="enabled" class="flex min-w-0 items-center gap-2">{{ t('outputFolder') }}
      <AppDropdown v-model="model" :options="folders.map(folder => ({ value: folder.path, label: folder.name }))" class="min-w-0 max-w-52" />
    </label>
  </div>
</template>