<script setup lang="ts">
import FileCard from './FileCard.vue'
const { t } = useLanguage()

const {
  filteredFiles,
  activeFile,
  selectFile
} = useFiles()

const openSummary = (file: any) => {
  selectFile(file)

  // позже:
  // useAiPanel().rightTab.value = 'summary'
}
</script>

<template>
  <div class="flex-1 overflow-y-auto p-4">

    <div
        v-if="filteredFiles.length === 0"
        class="flex h-64 flex-col items-center
             justify-center text-center"
    >
      <Icon
          name="lucide:file-search"
          size="48"
          class="mb-3 text-gray-300 dark:text-gray-700"
      />

      <p class="font-semibold text-gray-700 dark:text-gray-300">
        {{ t('noMatchingFiles') }}
      </p>

      <p class="mt-1 text-xs text-gray-500">
        {{ t('adjustQuery') }}
      </p>
    </div>

    <div v-else class="space-y-3">
      <FileCard
          v-for="file in filteredFiles"
          :key="file.id"
          :file="file"
          :active="activeFile?.id === file.id"
          @select="selectFile"
          @summary="openSummary"
      />
    </div>

  </div>
</template>
