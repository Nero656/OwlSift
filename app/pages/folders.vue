<script setup lang="ts">
const { folders, selectedFolder } = useFiles()
const { t } = useLanguage()
const folderView = useState<'list' | 'grid'>('folder-view', () => 'grid')

const openFolder = async (folderName: string) => {
  selectedFolder.value = folderName
  await navigateTo('/')
}
</script>

<template>
  <section class="flex-1 overflow-y-auto p-5 md:p-7">
    <header class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">{{ t('workspaces') }}</h1>
      <div class="inline-flex rounded-lg border border-gray-200 p-1 dark:border-gray-700" role="group" :aria-label="t('workspaces')">
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors"
          :class="folderView === 'list' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'"
          :aria-pressed="folderView === 'list'"
          @click="folderView = 'list'"
        >
          <Icon name="lucide:list" size="14" />{{ t('listView') }}
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors"
          :class="folderView === 'grid' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'"
          :aria-pressed="folderView === 'grid'"
          @click="folderView = 'grid'"
        >
          <Icon name="lucide:layout-grid" size="14" />{{ t('gridView') }}
        </button>
      </div>
    </header>

    <div v-if="folders.length" :class="folderView === 'grid' ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3' : 'flex flex-col gap-2'">
      <article
        v-for="folder in folders"
        :key="folder.path"
        class="flex min-w-0 items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-800/50"
        :class="folderView === 'list' ? 'w-full' : 'flex-col items-start'"
      >
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
          <Icon name="lucide:folder-git-2" size="20" />
        </div>
        <div class="min-w-0 flex-1" :class="folderView === 'grid' ? 'w-full' : ''">
          <h2 class="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{{ folder.name }}</h2>
          <p class="mt-1 truncate font-mono text-[11px] text-gray-400">{{ folder.path }}</p>
          <p class="mt-2 text-xs text-gray-500">{{ folder.count }} {{ t('files') }}</p>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-600 transition hover:bg-emerald-500/20 dark:text-emerald-400"
          @click="openFolder(folder.name)"
        >
          {{ t('openFolder') }}
        </button>
      </article>
    </div>

    <div v-else class="flex min-h-64 flex-col items-center justify-center text-center">
      <Icon name="lucide:folder-open" size="40" class="mb-3 text-gray-300 dark:text-gray-700" />
      <p class="max-w-sm text-sm text-gray-500">{{ t('noIndexedFolders') }}</p>
    </div>
  </section>
</template>
