<script setup lang="ts">
import type { LocalFile } from '~/types/file'

const props = withDefaults(defineProps<{ tag?: string; folderPath?: string }>(), { tag: 'div' })
const emit = defineEmits<{ imported: [files: LocalFile[]] }>()
const { importDroppedFiles, openFileTransfer } = useFiles()
const { t } = useLanguage()
const depth = ref(0)
const importing = ref(false)
const notice = ref('')
const hasInternalFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('application/x-owlsift-files')
const hasFiles = (event: DragEvent) => hasInternalFiles(event) || Array.from(event.dataTransfer?.types ?? []).includes('Files')
const enter = (event: DragEvent) => {
  if (!hasFiles(event)) return
  event.preventDefault()
  event.stopPropagation()
  depth.value++
}
const over = (event: DragEvent) => {
  if (!hasFiles(event)) return
  event.preventDefault()
  event.stopPropagation()
  if (event.dataTransfer) event.dataTransfer.dropEffect = importing.value ? 'none' : hasInternalFiles(event) && !event.ctrlKey ? 'move' : 'copy'
}
const leave = (event: DragEvent) => {
  event.stopPropagation()
  depth.value = Math.max(0, depth.value - 1)
}
const drop = async (event: DragEvent) => {
  if (!hasFiles(event)) return
  event.preventDefault()
  event.stopPropagation()
  depth.value = 0
  if (importing.value) return
  const transfer = event.dataTransfer
  if (!transfer) return
  if (hasInternalFiles(event)) {
    try {
      const ids: unknown = JSON.parse(transfer.getData('application/x-owlsift-files'))
      if (Array.isArray(ids) && ids.every(id => Number.isInteger(id))) openFileTransfer(ids,event.ctrlKey || event.metaKey ? 'copy' : 'move',props.folderPath)
    } catch { notice.value = t('workspaceTransferError') }
    return
  }
  // Capture File objects before the browser clears the drag data store.
  const sources = Array.from(transfer.files)
  const directories = Array.from(transfer.items).filter(item => item.webkitGetAsEntry?.()?.isDirectory).length
  if (!sources.length || directories) { notice.value = t('dropDirectories'); return }
  importing.value = true
  notice.value = ''
  try {
    const result = await importDroppedFiles(sources, props.folderPath)
    notice.value = t('dropAdded') + ' ' + result.added.length + (result.skipped ? '. ' + t('dropSkipped') + ' ' + result.skipped : '')
    if (result.added.length) emit('imported', result.added)
  } catch { notice.value = t('fileAddError') }
  finally { importing.value = false }
}
</script>

<template>
  <component :is="tag" class="relative" :class="depth ? 'ring-2 ring-inset ring-primary-500' : ''"
    @dragenter="enter" @dragover="over" @dragleave="leave" @drop="drop">
    <slot />
    <div v-if="depth || importing" class="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-xl border-2 border-dashed border-primary-500 bg-white/90 p-3 text-center text-xs font-medium text-primary-700 dark:bg-surface-900/90 dark:text-primary-400" role="status">
      <span>{{ importing ? t('dropImporting') : t('dropFiles') }}</span>
    </div>
    <div v-if="notice" role="status" class="z-20 flex shrink-0 items-start gap-2 rounded-lg bg-primary-50 p-2 text-xs text-primary-800 dark:bg-surface-800 dark:text-primary-300">
      <span class="min-w-0 flex-1 break-words">{{ notice }}</span>
      <button type="button" class="shrink-0" :aria-label="t('closeDialog')" @click.stop.prevent="notice = ''"><Icon name="lucide:x" size="14" /></button>
    </div>
  </component>
</template>
