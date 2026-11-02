<script setup lang="ts">
import type { LocalFile } from '~/types/file'

const props = defineProps<{ file: LocalFile; active?: boolean; layout?: 'list' | 'grid'; selectable?: boolean; selected?: boolean; hideSummary?: boolean }>()
const { t } = useLanguage()
const { settings } = useSettings()
const { openIndexedFile, selectFile, renameIndexedFile, deleteIndexedFile, deleteFileFromDisk, openFileTransfer, selectedFileIds, folders } = useFiles()
const emit = defineEmits<{ select: [file: LocalFile]; summary: [file: LocalFile]; toggle: [file: LocalFile] }>()
const desktop = ref(false)
const transferIds = () => props.selected && selectedFileIds.value.includes(props.file.id) ? [...selectedFileIds.value] : [props.file.id]
const startDrag = (event: DragEvent) => {
  if (!desktop.value || !event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'copyMove'
  event.dataTransfer.setData('application/x-owlsift-files',JSON.stringify(transferIds()))
}
const renameDialogOpen = ref(false)
const renameValue = ref('')
const renameBusy = ref(false)
const contextItems = computed(() => [
  { label: t('openFile'), icon: 'lucide:external-link', onSelect: () => void openIndexedFile(props.file.id).catch(showFileActionError) },
  { label: t('previewFile'), icon: 'lucide:eye', onSelect: (): void => { selectFile(props.file) } },
  { label: t('copyPath'), icon: 'lucide:copy', onSelect: () => void copyFilePath() },
  { type: 'separator' as const },
  ...(desktop.value ? [
    { label: t('workspaceCopyTo'), icon: 'lucide:copy', disabled: !folders.value.length, onSelect: () => openFileTransfer(transferIds(),'copy') },
    { label: t('workspaceMoveTo'), icon: 'lucide:folder-input', disabled: !folders.value.length, onSelect: () => openFileTransfer(transferIds(),'move') },
  ] : []),
  { label: t('renameFile'), icon: 'lucide:pencil', onSelect: () => void renameFile() },
  { label: t('deleteFile'), icon: 'lucide:trash-2', color: 'error' as const, onSelect: (): void => { void deleteFile() } },
])

function showFileActionError(error: unknown) {
  if (import.meta.client) window.alert(error instanceof Error ? error.message : String(error))
}

async function copyFilePath() {
  try { await navigator.clipboard.writeText(props.file.path) }
  catch { showFileActionError(new Error(t('copyPathFailed'))) }
}

function renameFile() {
  const extension = props.file.extension ? '.' + props.file.extension : ''
  const currentBaseName = extension && props.file.name.toLowerCase().endsWith(extension.toLowerCase()) ? props.file.name.slice(0, -extension.length) : props.file.name
  renameValue.value = currentBaseName
  renameDialogOpen.value = true
}

async function saveRename() {
  const requestedName = renameValue.value.trim()
  if (!requestedName || renameBusy.value) return
  renameBusy.value = true
  try {
    await renameIndexedFile(props.file.id, requestedName)
    renameDialogOpen.value = false
  } catch (error) { showFileActionError(error) }
  finally { renameBusy.value = false }
}

async function deleteFile() {
  const confirmMessage = t(import.meta.client && window.electron ? 'deleteFileConfirm' : 'deleteBrowserFileConfirm').replace('{name}', props.file.name)
  if (!window.confirm(confirmMessage)) return
  try {
    if (import.meta.client && window.electron) await deleteFileFromDisk(props.file.id, 'trash')
    else await deleteIndexedFile(props.file.id)
  } catch (error) { showFileActionError(error) }
}

const activate = () => {
  if (props.selectable) emit('toggle', props.file)
  emit('select', props.file)
}
const handleKeydown = (event: KeyboardEvent) => {
  if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
  event.preventDefault()
  if (!event.repeat) activate()
}

const graphicExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg', 'ico', 'tif', 'tiff', 'heic', 'heif', 'psd', 'ai', 'eps', 'raw', 'cr2', 'nef'])
const previewExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg'])
const isGraphic = computed(() => graphicExtensions.has(props.file.extension.toLowerCase().replace(/^\./, '')))
const thumbnail = ref<string | undefined>(props.file.thumbnail)
const cardElement = ref<HTMLElement | null>(null)
let cardIsNearViewport = false
let thumbnailObserver: IntersectionObserver | undefined
let thumbnailRequest = 0

const loadThumbnail = async () => {
  const request = ++thumbnailRequest
  thumbnail.value = undefined
  if (!import.meta.client || !settings.value.showThumbnails || !previewExtensions.has(props.file.extension.toLowerCase().replace(/^\./, ''))) return
  if (props.file.thumbnail) { thumbnail.value = props.file.thumbnail; return }
  if (!window.electron) return
  try {
    const preview = await window.electron.invoke('files:get-image-preview', props.file.id)
    if (request === thumbnailRequest) thumbnail.value = preview ?? undefined
  } catch (error) {
    console.warn('Could not load card image preview:', error)
  }
}

watch(() => [props.file.id, props.file.thumbnail, settings.value.showThumbnails], () => { if (cardIsNearViewport) void loadThumbnail() })

onMounted(() => {
  desktop.value = Boolean(window.electron)
  if (!cardElement.value) return
  if (typeof IntersectionObserver === 'undefined') { cardIsNearViewport = true; void loadThumbnail(); return }
  thumbnailObserver = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      cardIsNearViewport = true
      void loadThumbnail()
      thumbnailObserver?.disconnect()
    }
  }, { rootMargin: '300px' })
  thumbnailObserver.observe(cardElement.value)
})

onBeforeUnmount(() => thumbnailObserver?.disconnect())

const icon = computed(() => {
  if (isGraphic.value) return 'lucide:image'
  switch (props.file.extension.toLowerCase()) {
    case 'pdf': return 'lucide:file-text'
    case 'docx': return 'lucide:file-type-2'
    case 'md': return 'lucide:file-code'
    case 'txt': return 'lucide:file-text'
    default: return 'lucide:file'
  }
})

const badgeClass = computed(() => isGraphic.value ? 'bg-purple-500/10 text-purple-500' : props.file.extension === 'pdf' ? 'bg-red-500/10 text-red-500' : props.file.extension === 'docx' ? 'bg-blue-500/10 text-blue-500' : props.file.extension === 'md' ? 'bg-primary-500/10 text-primary-500' : 'bg-surface-500/10 text-surface-500')
</script>

<template>
  <UContextMenu :items="contextItems" :aria-label="t('contextMenu')">
  <article :draggable="desktop" @dragstart="startDrag" ref="cardElement" class="group relative w-full min-w-0 cursor-pointer overflow-hidden rounded-xl border p-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:p-4" :class="[layout === 'grid' ? 'h-full file-card-grid' : 'file-card-list', (selectable ? selected : active) ? 'border-primary-500 bg-primary-500/10 shadow-sm ring-1 ring-inset ring-primary-500/40' : 'border-surface-200/80 bg-white hover:border-surface-300 hover:shadow-sm dark:border-surface-800 dark:bg-surface-800/50 dark:hover:border-surface-700']" role="button" tabindex="0" :aria-label="file.name" :aria-pressed="selectable ? Boolean(selected) : undefined" @click="activate" @keydown="handleKeydown">
    <div class="file-card-body" :class="layout === 'grid' ? 'flex h-full min-w-0 flex-col gap-3' : 'flex min-w-0 flex-wrap items-start gap-3'">
      <div class="file-card-main" :class="layout === 'grid' ? 'flex min-w-0 flex-1 flex-col gap-3' : 'flex min-w-0 flex-[1_1_14rem] items-start gap-3'">
        <div v-if="thumbnail && settings.showThumbnails" class="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-surface-200 bg-surface-100 ring-2 ring-white dark:border-surface-700 dark:bg-surface-900 dark:ring-surface-800">
          <img :src="thumbnail" :alt="file.name" loading="lazy" class="h-full w-full object-cover" @error="thumbnail = undefined">
        </div>
        <div v-else class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold" :class="badgeClass">
          <Icon :name="icon" size="20" />
        </div>

        <div class="file-card-content min-w-0 flex-1">
          <div class="flex min-w-0 flex-col items-start gap-1.5">
            <h3 class="w-full min-w-0 text-sm font-semibold text-surface-900 transition-colors group-hover:text-primary-500 dark:text-surface-100" :class="layout === 'grid' ? 'break-words [overflow-wrap:anywhere]' : 'truncate'">{{ file.name }}</h3>
            <div v-if="file.tags.length" class="flex min-w-0 gap-1.5" :class="layout === 'grid' ? 'w-full flex-nowrap overflow-x-auto' : 'w-full flex-wrap'">
              <span v-for="tag in file.tags" :key="tag" class="shrink-0 rounded-full bg-surface-100 px-2 py-0.5 text-[10px] font-medium text-surface-500 dark:bg-surface-700 dark:text-surface-400">#{{ tag }}</span>
            </div>
          </div>
          <p class="mt-0.5 truncate font-mono text-xs text-surface-400">{{ file.path }}</p>
          <div class="mt-2.5 max-h-16 overflow-hidden break-words rounded-lg border border-surface-100 bg-surface-50 p-2.5 text-xs leading-relaxed text-surface-600 [overflow-wrap:anywhere] dark:border-surface-800 dark:bg-surface-900/60 dark:text-surface-300">{{ file.snippet }}</div>
          <button v-if="!hideSummary" type="button" class="file-card-summary mt-2 inline-flex max-w-full items-center gap-1 rounded-lg bg-primary-500/10 px-2.5 py-1 text-left text-[11px] font-medium leading-tight text-primary-600 transition hover:bg-primary-500/20 dark:text-primary-400" @click.stop="emit('summary', file)">
            <Icon name="lucide:sparkles" size="12" class="shrink-0" /><span class="min-w-0 break-words">{{ t('aiSummary') }}</span>
          </button>
        </div>
      </div>

      <div class="file-card-meta" :class="layout === 'grid' ? 'flex w-full shrink-0 items-center justify-between border-t border-surface-100 pt-2 text-[11px] text-surface-400 dark:border-surface-700' : 'flex shrink-0 flex-col items-end justify-between self-stretch text-right text-[11px] text-surface-400'">
        <UDropdownMenu :items="contextItems" :content="{side:'bottom',align:'end',collisionPadding:12}" :modal="false">
          <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" size="xs" :aria-label="`${t('workspaceFileActions')}: ${file.name}`" @click.stop @pointerdown.stop />
        </UDropdownMenu>
        <div :class="layout === 'grid' ? 'flex flex-col items-start' : ''"><div>{{ file.size }}</div><div>{{ file.mtime }}</div></div>
      </div>
    </div>
  </article>
  </UContextMenu>
  <Teleport to="body">
    <div v-if="renameDialogOpen" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" @click.self="renameDialogOpen = false" @keydown.esc="renameDialogOpen = false">
      <section class="w-full max-w-md rounded-xl border border-surface-200 bg-white p-5 shadow-2xl dark:border-surface-700 dark:bg-surface-900" role="dialog" aria-modal="true" :aria-label="t('renameFile')">
        <h2 class="text-base font-semibold text-surface-900 dark:text-surface-100">{{ t('renameFile') }}</h2>
        <label class="mt-4 block text-sm text-surface-600 dark:text-surface-300" :for="`file-rename-${file.id}`">{{ t('renameFilePrompt') }}</label>
        <input :id="`file-rename-${file.id}`" v-model="renameValue" autofocus class="mt-2 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-surface-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100" maxlength="180" @keydown.enter.prevent="saveRename" @keydown.esc="renameDialogOpen = false">
        <div class="mt-5 flex justify-end gap-2">
          <UButton color="neutral" variant="outline" :disabled="renameBusy" @click="renameDialogOpen = false">{{ t('cancel') }}</UButton>
          <UButton color="primary" :loading="renameBusy" :disabled="!renameValue.trim()" @click="saveRename">{{ t('save') }}</UButton>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
@media (max-width: 600px) {
  .file-card-list .file-card-body { flex-wrap: wrap; }
  .file-card-list .file-card-main { min-width: 0; flex-basis: 100%; }
  .file-card-content { min-width: 0; }
  .file-card-meta { width: 100%; flex-direction: row; justify-content: space-between; text-align: left; }
  .file-card-summary { max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
}
</style>
