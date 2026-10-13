<script setup lang="ts">
import FileCard from './FileCard.vue'
const { t } = useLanguage()

const {
  filteredFiles,
  activeFile,
  selectFile,
  sortBy,
  selectedTag,
  allTags,
} = useFiles()
const fileView = useState<'list' | 'grid'>('file-view', () => 'grid')

const openSummary = (file: any) => {
  selectFile(file)

  // позже:
  // useAiPanel().rightTab.value = 'summary'
}
</script>

<template>
  <div class="flex-1 overflow-y-auto p-4">
    <div class="mb-4 flex flex-wrap items-center justify-end gap-2">
      <div class="inline-flex rounded-lg border border-gray-200 p-1 dark:border-gray-700" role="group" :aria-label="t('search')">
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors"
          :class="fileView === 'list' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'"
          :aria-pressed="fileView === 'list'"
          @click="fileView = 'list'"
        >
          <Icon name="lucide:list" size="14" />{{ t('listView') }}
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors"
          :class="fileView === 'grid' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'"
          :aria-pressed="fileView === 'grid'"
          @click="fileView = 'grid'"
        >
          <Icon name="lucide:layout-grid" size="14" />{{ t('gridView') }}
        </button>
      </div>

      <label class="flex items-center gap-2 text-xs text-gray-500">
        <span>{{ t('sortLabel') }}</span>
        <select v-model="sortBy" class="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs text-gray-700 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
          <option value="relevance">{{ t('sortRelevance') }}</option>
          <option value="date">{{ t('sortDate') }}</option>
          <option value="name">{{ t('sortName') }}</option>
          <option value="tag">{{ t('sortTag') }}</option>
        </select>
      </label>

      <label class="flex items-center gap-2 text-xs text-gray-500">
        <span>{{ t('filterTag') }}</span>
        <select v-model="selectedTag" class="max-w-40 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs text-gray-700 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
          <option :value="null">{{ t('allTags') }}</option>
          <option v-for="tag in allTags" :key="tag" :value="tag">#{{ tag }}</option>
        </select>
      </label>
    </div>

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

    <div v-else :class="fileView === 'grid' ? 'grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3' : 'flex flex-col gap-3'">
      <FileCard
          v-for="file in filteredFiles"
          :key="file.id"
          :file="file"
          :layout="fileView"
          :active="activeFile?.id === file.id"
          @select="selectFile"
          @summary="openSummary"
      />
    </div>

  </div>
</template>
