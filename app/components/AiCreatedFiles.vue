<script setup lang="ts">
import type { ChatFileReference } from '~/types/file'
defineProps<{ files: ChatFileReference[]; title?: string }>()
const { t } = useLanguage()
</script>
<template>
  <div v-if="files.length" class="mt-3 min-w-0 space-y-2">
    <p class="text-xs font-semibold">{{ title ?? t('createdDocuments') }}</p>
    <div v-for="file in files" :key="file.path ?? file.id" class="min-w-0">
      <ChatFileAttachment :file="file" />
      <p v-if="file.path" class="mt-1 break-all pl-1 text-[10px] leading-relaxed opacity-60">{{ t('fileSavedTo') }}: {{ file.path }}</p>
    </div>
  </div>
</template>
