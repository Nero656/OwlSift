<script setup lang="ts">
import type { LocalFile } from '~/types/file'
import { extractDocumentText } from '~/utils/documents'

const props = defineProps<{ file: LocalFile | null; openError?: string }>()
const emit = defineEmits<{ close: []; openExternal: [] }>()
const { getIndexedFileBlob } = useFiles()
const { t } = useLanguage()

const supportedExtensions = new Set([
  'pdf', 'docx', 'odt', 'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'xml', 'html', 'htm',
  'js', 'ts', 'vue', 'css', 'scss', 'yaml', 'yml', 'log', 'sql', 'py', 'java', 'c', 'cpp', 'h', 'sh',
])
const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])
const imageMimeTypes: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }
const state = ref<'idle' | 'loading' | 'ready' | 'unsupported' | 'error'>('idle')
const previewText = ref('')
const pdfUrl = ref('')
const imageUrl = ref('')
const imageScale = ref(1)
const activeRequest = ref(0)

const disposePdfUrl = () => {
  if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value)
  pdfUrl.value = ''
}
const disposeImageUrl = () => {
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  imageUrl.value = ''
}

watch(() => props.file?.id, async () => {
  const request = ++activeRequest.value
  previewText.value = ''
  disposePdfUrl()
  disposeImageUrl()
  imageScale.value = 1
  const file = props.file
  const extension = file?.extension.toLowerCase().replace(/^\./, '')
  if (!file) { state.value = 'idle'; return }
  if (!extension || (!supportedExtensions.has(extension) && !imageExtensions.has(extension))) { state.value = 'unsupported'; return }

  state.value = 'loading'
  try {
    const blob = await getIndexedFileBlob(file.id)
    if (!blob.size) throw new Error('Empty document')
    if (request !== activeRequest.value) return

    if (extension === 'pdf') {
      pdfUrl.value = URL.createObjectURL(blob)
      state.value = 'ready'
      return
    }

    if (imageExtensions.has(extension)) {
      const expectedMime = imageMimeTypes[extension]
      const imageBlob = blob.type === expectedMime ? blob : new Blob([blob], { type: expectedMime })
      imageUrl.value = URL.createObjectURL(imageBlob)
      state.value = 'ready'
      return
    }

    const source = new File([blob], file.name, { type: blob.type || 'text/plain;charset=utf-8' })
    const text = await extractDocumentText(source)
    if (request !== activeRequest.value) return
    if (!text.trim()) { state.value = 'error'; return }
    previewText.value = text
    state.value = 'ready'
  } catch (error) {
    if (request === activeRequest.value) {
      console.warn('Could not preview document:', error)
      state.value = 'error'
    }
  }
}, { immediate: true })

onBeforeUnmount(() => { disposePdfUrl(); disposeImageUrl() })
</script>

<template>
  <Teleport to="body">
    <div
      v-if="file"
      class="fixed inset-0 z-[110] flex items-center justify-center bg-surface-950/65 p-3 backdrop-blur-sm sm:p-6"
      @click.self="emit('close')"
      @keydown.esc.window="emit('close')"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-preview-title"
        class="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-2xl dark:border-surface-700 dark:bg-surface-900"
      >
        <header class="flex shrink-0 items-start justify-between gap-4 border-b border-surface-200 px-4 py-3 dark:border-surface-800 sm:px-6">
          <div class="min-w-0">
            <h2 id="document-preview-title" class="truncate text-base font-semibold text-surface-900 dark:text-surface-100">{{ t('documentPreviewTitle') }}</h2>
            <p class="mt-0.5 truncate text-xs text-surface-500">{{ file.name }} <span class="font-mono">.{{ file.extension }}</span></p>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <button type="button" class="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 px-2.5 py-2 text-xs font-medium text-surface-700 hover:bg-surface-50 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800" @click="emit('openExternal')">
              <Icon name="lucide:external-link" size="14" />{{ t('openFile') }}
            </button>
            <button type="button" class="rounded-lg p-2 text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-800" :aria-label="t('close')" @click="emit('close')">
              <Icon name="lucide:x" size="18" />
            </button>
          </div>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <div v-if="state === 'loading'" class="flex min-h-48 items-center justify-center gap-2 text-sm text-surface-500" role="status">
            <Icon name="lucide:loader-2" size="16" class="animate-spin" />{{ t('documentPreviewLoading') }}
          </div>
          <div v-else-if="state === 'unsupported'" class="flex min-h-48 flex-col items-center justify-center gap-2 text-center text-sm text-surface-500" role="status">
            <Icon name="lucide:file-question" size="28" />
            <p>{{ t('documentPreviewUnsupported') }}</p>
          </div>
          <div v-else-if="state === 'error'" class="flex min-h-48 flex-col items-center justify-center gap-2 text-center text-sm text-surface-500" role="status">
            <Icon name="lucide:file-warning" size="28" />
            <p>{{ t('documentPreviewUnavailable') }}</p>
          </div>
          <iframe
            v-else-if="state === 'ready' && pdfUrl"
            :src="pdfUrl"
            :title="file.name"
            class="h-[72dvh] min-h-[360px] w-full rounded-lg border border-surface-200 bg-white dark:border-surface-700"
          />
          <div v-else-if="state === 'ready' && imageUrl" class="max-h-[72dvh] min-h-[360px] overflow-auto overscroll-contain rounded-lg border border-surface-200 bg-surface-50 p-2 dark:border-surface-700 dark:bg-surface-950">
            <img :src="imageUrl" :alt="file.name" :style="{ width: `${imageScale * 100}%` }" class="mx-auto block h-auto max-w-none object-contain">
          </div>
          <article v-else-if="state === 'ready'" class="mx-auto max-w-4xl whitespace-pre-wrap break-words text-sm leading-7 text-surface-800 dark:text-surface-200" :class="['json', 'csv', 'tsv', 'xml', 'html', 'htm', 'js', 'ts', 'vue', 'css', 'scss', 'yaml', 'yml', 'log', 'sql', 'py', 'java', 'c', 'cpp', 'h', 'sh'].includes(file.extension.toLowerCase()) && 'font-mono text-xs leading-6'">
            {{ previewText }}
          </article>
        </div>
        <footer class="flex shrink-0 items-center justify-between gap-3 border-t border-surface-200 px-4 py-3 dark:border-surface-800 sm:px-6">
          <div v-if="imageUrl" class="flex items-center gap-1">
            <button type="button" class="rounded-lg border border-surface-200 p-2 text-surface-600 hover:bg-surface-50 disabled:opacity-40 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800" :aria-label="t('zoomOut')" :title="t('zoomOut')" :disabled="imageScale <= 0.5" @click="imageScale = Math.max(0.5, imageScale - 0.25)"><Icon name="lucide:minus" size="14" /></button>
            <span class="min-w-12 text-center text-xs text-surface-500">{{ Math.round(imageScale * 100) }}%</span>
            <button type="button" class="rounded-lg border border-surface-200 p-2 text-surface-600 hover:bg-surface-50 disabled:opacity-40 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800" :aria-label="t('zoomIn')" :title="t('zoomIn')" :disabled="imageScale >= 4" @click="imageScale = Math.min(4, imageScale + 0.25)"><Icon name="lucide:plus" size="14" /></button>
            <button type="button" class="ml-1 rounded-lg border border-surface-200 px-2.5 py-2 text-xs text-surface-600 hover:bg-surface-50 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800" @click="imageScale = 1">{{ t('resetZoom') }}</button>
          </div>
          <p v-if="openError" role="alert" class="ml-auto text-xs text-rose-500">{{ openError }}</p>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
