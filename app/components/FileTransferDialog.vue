<script setup lang="ts">
import type { WorkspaceTransferMode } from '../../src/types/workspace'
const { files, folders, fileTransferRequest, transferWorkspaceFiles } = useFiles()
const { t } = useLanguage()
const toast = useToast()
const dialog = ref<HTMLDialogElement | null>(null)
const target = ref('')
const mode = ref<WorkspaceTransferMode>('copy')
const busy = ref(false)
const error = ref('')
const selected = computed(() => files.value.filter(file => fileTransferRequest.value?.fileIds.includes(file.id)))
watch(fileTransferRequest, async request => {
  if (!request) { dialog.value?.close(); return }
  mode.value = request.mode
  target.value = request.targetFolderPath ?? ''
  error.value = ''
  await nextTick()
  dialog.value?.showModal()
})
const close = () => { if (!busy.value) fileTransferRequest.value = null }
const submit = async () => {
  const request = fileTransferRequest.value
  if (!request || !target.value || busy.value) return
  busy.value = true; error.value = ''
  try {
    const result = await transferWorkspaceFiles([...request.fileIds],target.value,mode.value)
    if (result.completed.length) toast.add({title:t('workspaceTransferDone'),description:`${result.completed.length} · ${target.value}`,color:'success'})
    if (result.failed.length) {
      error.value = result.failed.map(item => `${files.value.find(file => file.id === item.fileId)?.name ?? item.fileId}: ${item.message}`).join('\n')
      request.fileIds = result.failed.map(item => item.fileId)
    } else { fileTransferRequest.value = null }
  } catch (cause) { error.value = `${t('workspaceTransferError')} ${cause instanceof Error ? cause.message : String(cause)}` }
  finally { busy.value = false }
}
</script>
<template>
  <Teleport to="body">
    <dialog ref="dialog" class="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-surface-200 bg-white p-5 text-surface-900 shadow-2xl backdrop:bg-black/60 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-100" aria-labelledby="workspace-transfer-title" @cancel="busy ? $event.preventDefault() : close()" @close="close">
      <h2 id="workspace-transfer-title" class="text-base font-semibold">{{ t('workspaceTransferTitle') }}</h2>
      <p class="mt-2 text-xs text-surface-500">{{ t('selectedDocuments') }} {{ selected.length }}</p>
      <ul class="my-3 max-h-32 overflow-y-auto text-xs"><li v-for="file in selected" :key="file.id" class="truncate py-1">{{ file.name }}</li></ul>
      <label class="block text-sm">{{ t('workspaceOperation') }}<AppDropdown v-model="mode" :options="[{value:'copy',label:t('workspaceCopy')},{value:'move',label:t('workspaceMove')}]" :disabled="busy" class="mt-2" /></label>
      <label class="mt-4 block text-sm">{{ t('workspaceDestination') }}<AppDropdown v-model="target" :options="folders.map(folder => ({value:folder.path,label:folder.name+' — '+folder.path}))" :placeholder="t('workspaceChooseDestination')" :disabled="busy" class="mt-2" /></label>
      <p class="mt-3 text-xs text-surface-500">{{ t('workspaceCollisionHint') }}</p>
      <p v-if="!folders.length" class="mt-2 text-xs text-amber-600">{{ t('noIndexedFolders') }}</p>
      <p v-if="error" role="alert" class="mt-3 whitespace-pre-wrap break-words text-xs text-rose-500">{{ error }}</p>
      <div class="mt-5 flex justify-end gap-2"><UButton color="neutral" variant="outline" :disabled="busy" @click="close">{{ t('cancel') }}</UButton><UButton :loading="busy" :disabled="!target || !selected.length || busy" @click="submit">{{ t(mode === 'move' ? 'workspaceMove' : 'workspaceCopy') }}</UButton></div>
    </dialog>
  </Teleport>
</template>
