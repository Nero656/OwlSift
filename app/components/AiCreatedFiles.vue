<script setup lang="ts">
import type { ChatFileReference } from '~/types/file'
defineProps<{ files: ChatFileReference[]; title?: string }>()
const { t } = useLanguage()
</script>
<template>
  <div v-if="files.length" class="mt-3 min-w-0 space-y-2">
    <p class="text-xs font-semibold">{{ title ?? t('createdDocuments') }}</p>
    <ChatFileAttachment v-for="file in files" :key="file.path ?? file.id" :file="file" />
  </div>
</template>
