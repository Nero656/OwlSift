<script setup lang="ts">
import type { IndexedFolder } from '~/types/file'

const { folders, selectedFolder, removeIndexedFolder, maxFilesPerFolder } = useFiles()
const { t } = useLanguage()
const folderView = useState<'list' | 'grid'>('folder-view', () => 'grid')
const folderToRemove = ref<IndexedFolder | null>(null)
const removeError = ref('')
const isRemoving = ref(false)

const openFolder = async (folderName: string) => {
  selectedFolder.value = folderName
  await navigateTo('/')
}

const confirmRemoveFolder = async () => {
  if (!folderToRemove.value || isRemoving.value) return
  isRemoving.value = true
  removeError.value = ''
  try {
    await removeIndexedFolder(folderToRemove.value.path)
    folderToRemove.value = null
  } catch (error) {
    console.error('Could not remove indexed folder:', error)
    removeError.value = t('folderRemoveError')
  } finally {
    isRemoving.value = false
  }
}
</script>

<template>
  <section class="flex-1 overflow-y-auto p-5 md:p-7">
    <header class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">{{ t('workspaces') }}</h1>
      <p class="mr-auto basis-full text-xs text-gray-500">{{ t('folderIndexLimit') }} <strong class="font-semibold text-gray-700 dark:text-gray-300">{{ maxFilesPerFolder }}</strong></p>
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
        <div class="flex shrink-0 items-center gap-2" :class="folderView === 'grid' ? 'w-full' : ''">
          <button
            type="button"
            class="flex-1 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-600 transition hover:bg-emerald-500/20 dark:text-emerald-400"
            @click="openFolder(folder.name)"
          >{{ t('openFolder') }}</button>
          <button
            type="button"
            class="rounded-lg p-2 text-gray-500 transition hover:bg-rose-500/10 hover:text-rose-600 dark:text-gray-400"
            :title="t('removeFromIndex')"
            :aria-label="`${t('removeFromIndex')}: ${folder.name}`"
            @click="folderToRemove = folder; removeError = ''"
          ><Icon name="lucide:trash-2" size="15" /></button>
        </div>
      </article>
    </div>

    <div v-else class="flex min-h-64 flex-col items-center justify-center text-center">
      <Icon name="lucide:folder-open" size="40" class="mb-3 text-gray-300 dark:text-gray-700" />
      <p class="max-w-sm text-sm text-gray-500">{{ t('noIndexedFolders') }}</p>
    </div>
  </section>

  <Teleport to="body">
    <div v-if="folderToRemove" class="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-sm" @click.self="!isRemoving && (folderToRemove = null)">
      <section role="dialog" aria-modal="true" aria-labelledby="remove-folder-title" class="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <h2 id="remove-folder-title" class="text-base font-semibold text-gray-900 dark:text-gray-100">{{ t('removeFolderTitle') }}</h2>
        <p class="mt-2 break-all text-sm text-gray-700 dark:text-gray-300">{{ folderToRemove.name }}</p>
        <p class="mt-2 text-xs leading-relaxed text-gray-500">{{ t('removeFolderMessage') }}</p>
        <p v-if="removeError" class="mt-3 text-xs text-rose-500" role="alert">{{ removeError }}</p>
        <div class="mt-5 flex justify-end gap-2">
          <button type="button" class="rounded-xl border border-gray-200 px-3.5 py-2 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-300" :disabled="isRemoving" @click="folderToRemove = null">{{ t('cancel') }}</button>
          <button type="button" class="rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50" :disabled="isRemoving" @click="confirmRemoveFolder">{{ t('removeFromIndex') }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
