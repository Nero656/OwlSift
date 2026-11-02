<script setup lang="ts">
import type { IndexedFolder } from '~/types/file'

const { folders, selectedFolder, removeIndexedFolder, maxFilesPerFolder, addOneFile, openCreateFileDialog, createWorkspaceFolder } = useFiles()
const { t } = useLanguage()
const folderView = useState<'list' | 'grid'>('folder-view', () => 'grid')
const folderToRemove = ref<IndexedFolder | null>(null)
const removeError = ref('')
const isRemoving = ref(false)
const fileActionNotice = ref('')
const desktop = ref(false)
const createDialog = ref<HTMLDialogElement | null>(null)
const newFolderName = ref('')
const parentPath = ref('')
const creating = ref(false)
const createError = ref('')
onMounted(() => { desktop.value = Boolean(window.electron) })
const openCreateWorkspace = async () => {
  newFolderName.value = ''; createError.value = ''
  createDialog.value?.showModal()
  try { if (!parentPath.value) parentPath.value = await window.electron.invoke('folders:default-location') }
  catch { createError.value = t('workspaceCreateError') }
}
const chooseParent = async () => {
  try {
    const selected = await window.electron.invoke('folders:choose-parent')
    if (selected) parentPath.value = selected
  } catch { createError.value = t('workspaceCreateError') }
}
const createWorkspace = async () => {
  if (creating.value || !parentPath.value || !newFolderName.value.trim()) return
  creating.value = true; createError.value = ''
  try {
    await createWorkspaceFolder(parentPath.value,newFolderName.value)
    createDialog.value?.close()
    fileActionNotice.value = t('workspaceCreated')
  } catch (cause) { createError.value = `${t('workspaceCreateError')} ${cause instanceof Error ? cause.message : String(cause)}` }
  finally { creating.value = false }
}

const addFileToFolder = async (folderPath: string) => {
  fileActionNotice.value = ''
  try {
    const result = await addOneFile(folderPath)
    if (result) fileActionNotice.value = `${t('folderFilesIndexed')} ${result.indexedCount}${result.skippedCount ? '. ' + t('scanDocumentsSkipped') + ' ' + result.skippedCount : ''}`
  } catch (error) {
    console.error('Could not add file to folder:', error)
    fileActionNotice.value = t('fileAddError')
  }
}

const openFolder = async (folderPath: string) => {
  selectedFolder.value = folderPath
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
  <section class="flex-1 overflow-y-auto p-5 md:p-7" @dragover.prevent @drop.prevent.stop>
    <header class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-bold text-surface-900 dark:text-surface-100">{{ t('workspaces') }}</h1>
      <UButton v-if="desktop" icon="i-lucide-folder-plus" @click="openCreateWorkspace">{{ t('workspaceCreate') }}</UButton>
      <p class="mr-auto basis-full text-xs text-surface-500">{{ t('folderIndexLimit') }} <strong class="font-semibold text-surface-700 dark:text-surface-300">{{ maxFilesPerFolder }}</strong></p>
      <p v-if="fileActionNotice" class="basis-full text-xs text-primary-600">{{ fileActionNotice }}</p>
      <div class="inline-flex rounded-lg border border-surface-200 p-1 dark:border-surface-700" role="group" :aria-label="t('workspaces')">
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors"
          :class="folderView === 'list' ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400' : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800'"
          :aria-pressed="folderView === 'list'"
          @click="folderView = 'list'"
        >
          <Icon name="lucide:list" size="14" />{{ t('listView') }}
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors"
          :class="folderView === 'grid' ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400' : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800'"
          :aria-pressed="folderView === 'grid'"
          @click="folderView = 'grid'"
        >
          <Icon name="lucide:layout-grid" size="14" />{{ t('gridView') }}
        </button>
      </div>
    </header>

    <div v-if="folders.length" :class="folderView === 'grid' ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3' : 'flex flex-col gap-2'">
      <FileDropZone tag="article" :folder-path="folder.path"
        v-for="folder in folders"
        :key="folder.path"
        class="workspace-card flex min-w-0 items-center gap-3 rounded-xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-800/50"
        :class="folderView === 'list' ? 'w-full' : 'flex-col items-start'"
      >
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 text-primary-500">
          <Icon name="lucide:folder-git-2" size="20" />
        </div>
        <div class="min-w-0 flex-1" :class="folderView === 'grid' ? 'w-full' : ''">
          <h2 class="truncate text-sm font-semibold text-surface-900 dark:text-surface-100">{{ folder.name }}</h2>
          <p class="mt-1 truncate font-mono text-[11px] text-surface-400">{{ folder.path }}</p>
          <p class="mt-2 text-xs text-surface-500">{{ folder.count }} {{ t('files') }}</p>
        </div>
        <div class="workspace-card-actions flex min-w-0 shrink-0 flex-wrap items-center gap-2" :class="folderView === 'grid' ? 'w-full' : ''">
          <button
            type="button"
            class="flex-1 rounded-lg bg-primary-500/10 px-3 py-2 text-xs font-medium text-primary-600 transition hover:bg-primary-500/20 dark:text-primary-400"
            @click="openFolder(folder.path)"
          >{{ t('openFolder') }}</button>
          <button
            type="button"
            class="rounded-lg bg-surface-100 px-3 py-2 text-xs font-medium text-surface-700 transition hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-300"
            @click="addFileToFolder(folder.path)"
          >{{ t('addFileToFolder') }}</button>
          <button
            type="button"
            class="rounded-lg bg-surface-100 px-3 py-2 text-xs font-medium text-surface-700 transition hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-300"
            @click="openCreateFileDialog(folder.path)"
          >{{ t('createFile') }}</button>
          <button
            type="button"
            class="rounded-lg p-2 text-surface-500 transition hover:bg-rose-500/10 hover:text-rose-600 dark:text-surface-400"
            :title="t('removeFromIndex')"
            :aria-label="`${t('removeFromIndex')}: ${folder.name}`"
            @click="folderToRemove = folder; removeError = ''"
          ><Icon name="lucide:trash-2" size="15" /></button>
        </div>
      </FileDropZone>
    </div>

    <div v-else class="flex min-h-64 flex-col items-center justify-center text-center">
      <Icon name="lucide:folder-open" size="40" class="mb-3 text-surface-300 dark:text-surface-700" />
      <p class="max-w-sm text-sm text-surface-500">{{ t('noIndexedFolders') }}</p>
    </div>
  </section>

  <Teleport to="body">
    <dialog ref="createDialog" aria-labelledby="create-workspace-title" class="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-surface-200 bg-white p-5 text-surface-900 shadow-2xl backdrop:bg-black/60 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-100" @cancel="creating && $event.preventDefault()">
      <h2 id="create-workspace-title" class="text-base font-semibold">{{ t('workspaceCreate') }}</h2>
      <form class="mt-4 space-y-4" @submit.prevent="createWorkspace">
        <label class="block text-sm">{{ t('workspaceName') }}<input v-model="newFolderName" :disabled="creating" maxlength="120" autofocus required class="mt-2 w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 dark:border-surface-700 dark:bg-surface-800"></label>
        <div class="text-sm"><p>{{ t('workspaceParent') }}</p><p class="mt-2 break-all rounded-lg bg-surface-50 p-3 font-mono text-xs dark:bg-surface-800">{{ parentPath }}</p><UButton type="button" class="mt-2" color="neutral" variant="outline" :disabled="creating" @click="chooseParent">{{ t('workspaceChooseParent') }}</UButton></div>
        <p class="text-xs text-surface-500">{{ t('workspacePhysicalHint') }}</p>
        <p v-if="createError" role="alert" class="break-words text-xs text-rose-500">{{ createError }}</p>
        <div class="flex justify-end gap-2"><UButton type="button" color="neutral" variant="outline" :disabled="creating" @click="createDialog?.close()">{{ t('cancel') }}</UButton><UButton type="submit" :loading="creating" :disabled="creating || !newFolderName.trim() || !parentPath">{{ t('create') }}</UButton></div>
      </form>
    </dialog>
    <div v-if="folderToRemove" class="fixed inset-0 z-[100] flex items-center justify-center bg-surface-950/60 p-4 backdrop-blur-sm" @click.self="!isRemoving && (folderToRemove = null)">
      <section role="dialog" aria-modal="true" aria-labelledby="remove-folder-title" class="w-full max-w-md rounded-2xl border border-surface-200 bg-white p-5 shadow-2xl dark:border-surface-700 dark:bg-surface-900">
        <h2 id="remove-folder-title" class="text-base font-semibold text-surface-900 dark:text-surface-100">{{ t('removeFolderTitle') }}</h2>
        <p class="mt-2 break-all text-sm text-surface-700 dark:text-surface-300">{{ folderToRemove.name }}</p>
        <p class="mt-2 text-xs leading-relaxed text-surface-500">{{ t('removeFolderMessage') }}</p>
        <p v-if="removeError" class="mt-3 text-xs text-rose-500" role="alert">{{ removeError }}</p>
        <div class="mt-5 flex justify-end gap-2">
          <button type="button" class="rounded-xl border border-surface-200 px-3.5 py-2 text-xs text-surface-600 dark:border-surface-700 dark:text-surface-300" :disabled="isRemoving" @click="folderToRemove = null">{{ t('cancel') }}</button>
          <button type="button" class="rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50" :disabled="isRemoving" @click="confirmRemoveFolder">{{ t('removeFromIndex') }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
@media (max-width: 600px) {
  .workspace-card { flex-wrap: wrap; }
  .workspace-card-actions { width: 100%; flex: 1 1 100%; }
  .workspace-card-actions button { min-width: 0; overflow-wrap: anywhere; }
}
</style>
