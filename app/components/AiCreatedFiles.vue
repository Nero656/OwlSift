<script setup lang="ts">
defineProps<{ files: Array<{ id: number; name: string }> }>()
const { openIndexedFile } = useFiles()
const { t } = useLanguage()
const error = ref('')
const open = async (id: number) => {
  try { error.value = ''; await openIndexedFile(id) } catch { error.value = t('fileOpenError') }
}
</script>
<template>
  <div v-if="files.length" class="mt-3 space-y-2">
    <p class="text-xs font-semibold text-emerald-600">{{ t('createdDocuments') }}</p>
    <button v-for="file in files" :key="file.id" type="button" class="flex max-w-full items-center gap-2 rounded-lg border border-emerald-500/30 px-3 py-2 text-xs text-emerald-600" @click="open(file.id)">
      <Icon name="lucide:file-down" size="15" /><span class="truncate">{{ file.name }}</span>
    </button>
    <p v-if="error" role="alert" class="text-xs text-rose-500">{{ error }}</p>
  </div>
</template>