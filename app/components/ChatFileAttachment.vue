<script setup lang="ts">
import type { ChatFileReference } from '~/types/file'
const props = defineProps<{ file: ChatFileReference; label?: string }>()
const { files, getIndexedFileBlob, openIndexedFile } = useFiles()
const { t } = useLanguage()
const element = ref<HTMLElement | null>(null)
const resolved = computed(() => files.value.find(file => props.file.path ? file.path === props.file.path : file.id === props.file.id))
const extension = computed(() => (resolved.value?.extension ?? props.file.extension ?? props.file.name.split('.').pop() ?? '').toLowerCase())
const isImage = computed(() => ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'svg', 'ico'].includes(extension.value))
const url = ref('')
const error = ref('')
const loading = ref(false)
const failedPreview = ref(false)
const nearViewport = ref(false)
let observer: IntersectionObserver | undefined
let revision = 0
const release = () => { if (url.value) URL.revokeObjectURL(url.value); url.value = '' }
const load = async () => {
  const request = ++revision
  release(); error.value = ''; failedPreview.value = false
  if (!resolved.value) { loading.value = false; return }
  loading.value = true
  try {
    const blob = await getIndexedFileBlob(resolved.value.id)
    if (request === revision) url.value = URL.createObjectURL(blob)
  } catch { if (request === revision) error.value = t('chatFileUnavailable') }
  finally { if (request === revision) loading.value = false }
}
watch(() => [resolved.value?.id, resolved.value?.path, resolved.value?.mtimeValue], () => { if (nearViewport.value) void load() })
onMounted(() => {
  if (!element.value) return
  if (typeof IntersectionObserver === 'undefined') { nearViewport.value = true; void load(); return }
  observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return
    nearViewport.value = true; observer?.disconnect(); void load()
  }, { rootMargin: '200px' })
  observer.observe(element.value)
})
onBeforeUnmount(() => { revision++; observer?.disconnect(); release() })
const open = async (event: MouseEvent) => {
  if (!url.value || !resolved.value) { event.preventDefault(); return }
  if (!window.electron) return // A real browser download link retains the original bytes.
  event.preventDefault()
  try { await openIndexedFile(resolved.value.id) } catch { error.value = t('fileOpenError') }
}
</script>

<template>
  <div ref="element" class="min-w-0 max-w-full space-y-1.5">
    <img v-if="isImage && url && !failedPreview" :src="url" :alt="file.name" loading="lazy" class="max-h-64 max-w-full rounded-lg border border-current/15 bg-white/5 object-contain" @error="failedPreview = true">
    <a :href="url || undefined" :download="resolved?.name ?? file.name" :aria-disabled="!url" :aria-busy="loading" :title="url ? (resolved?.path ?? file.name) : t('chatFileUnavailable')" class="inline-flex max-w-full items-center gap-2 rounded-lg border border-current/20 px-3 py-2 text-xs underline decoration-current/40 underline-offset-4 transition hover:bg-current/5 aria-disabled:opacity-60" @click="open">
      <Icon :name="loading ? 'lucide:loader-circle' : isImage ? 'lucide:image' : 'lucide:file-down'" size="15" class="shrink-0" :class="{ 'animate-spin': loading }" />
      <span class="min-w-0 break-all">{{ label ?? file.name }}</span>
      <Icon name="lucide:arrow-up-right" size="13" class="shrink-0" />
    </a>
    <p v-if="error || !resolved" class="text-[11px] opacity-70">{{ error || t('chatFileUnavailable') }}</p>
  </div>
</template>
