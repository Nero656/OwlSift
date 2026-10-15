<script setup lang="ts">
import type { LocalFile } from '~/types/file'

const props = defineProps<{ file: LocalFile; active?: boolean; layout?: 'list' | 'grid'; selectable?: boolean; selected?: boolean; hideSummary?: boolean }>()
const { t } = useLanguage()
const { settings } = useSettings()
const emit = defineEmits<{ select: [file: LocalFile]; summary: [file: LocalFile]; toggle: [file: LocalFile] }>()

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

const badgeClass = computed(() => isGraphic.value ? 'bg-purple-500/10 text-purple-500' : props.file.extension === 'pdf' ? 'bg-red-500/10 text-red-500' : props.file.extension === 'docx' ? 'bg-blue-500/10 text-blue-500' : props.file.extension === 'md' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-gray-500/10 text-gray-500')
</script>

<template>
  <article ref="cardElement" class="group relative w-full min-w-0 cursor-pointer overflow-hidden rounded-xl border p-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:p-4" :class="[layout === 'grid' ? 'h-full file-card-grid' : 'file-card-list', (selectable ? selected : active) ? 'border-emerald-500 bg-emerald-500/10 shadow-sm ring-1 ring-inset ring-emerald-500/40' : 'border-gray-200/80 bg-white hover:border-gray-300 hover:shadow-sm dark:border-gray-800 dark:bg-gray-800/50 dark:hover:border-gray-700']" role="button" tabindex="0" :aria-label="file.name" :aria-pressed="selectable ? Boolean(selected) : undefined" @click="activate" @keydown="handleKeydown">
    <div class="file-card-body" :class="layout === 'grid' ? 'flex h-full min-w-0 flex-col gap-3' : 'flex min-w-0 flex-wrap items-start gap-3'">
      <div class="file-card-main" :class="layout === 'grid' ? 'flex min-w-0 flex-1 flex-col gap-3' : 'flex min-w-0 flex-[1_1_14rem] items-start gap-3'">
        <div v-if="thumbnail && settings.showThumbnails" class="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-gray-200 bg-gray-100 ring-2 ring-white dark:border-gray-700 dark:bg-gray-900 dark:ring-gray-800">
          <img :src="thumbnail" :alt="file.name" loading="lazy" class="h-full w-full object-cover" @error="thumbnail = undefined">
        </div>
        <div v-else class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold" :class="badgeClass">
          <Icon :name="icon" size="20" />
        </div>

        <div class="file-card-content min-w-0 flex-1">
          <div class="flex min-w-0 flex-col items-start gap-1.5">
            <h3 class="w-full min-w-0 text-sm font-semibold text-gray-900 transition-colors group-hover:text-emerald-500 dark:text-gray-100" :class="layout === 'grid' ? 'break-words [overflow-wrap:anywhere]' : 'truncate'">{{ file.name }}</h3>
            <div v-if="file.tags.length" class="flex min-w-0 gap-1.5" :class="layout === 'grid' ? 'w-full flex-nowrap overflow-x-auto' : 'w-full flex-wrap'">
              <span v-for="tag in file.tags" :key="tag" class="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">#{{ tag }}</span>
            </div>
          </div>
          <p class="mt-0.5 truncate font-mono text-xs text-gray-400">{{ file.path }}</p>
          <div class="mt-2.5 max-h-16 overflow-hidden break-words rounded-lg border border-gray-100 bg-gray-50 p-2.5 text-xs leading-relaxed text-gray-600 [overflow-wrap:anywhere] dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-300">{{ file.snippet }}</div>
          <button v-if="!hideSummary" type="button" class="file-card-summary mt-2 inline-flex max-w-full items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-left text-[11px] font-medium leading-tight text-emerald-600 transition hover:bg-emerald-500/20 dark:text-emerald-400" @click.stop="emit('summary', file)">
            <Icon name="lucide:sparkles" size="12" class="shrink-0" /><span class="min-w-0 break-words">{{ t('aiSummary') }}</span>
          </button>
        </div>
      </div>

      <div class="file-card-meta" :class="layout === 'grid' ? 'flex w-full shrink-0 items-center justify-between border-t border-gray-100 pt-2 text-[11px] text-gray-400 dark:border-gray-700' : 'flex shrink-0 flex-col items-end justify-between self-stretch text-right text-[11px] text-gray-400'">
        <div :class="layout === 'grid' ? 'flex flex-col items-start' : ''"><div>{{ file.size }}</div><div>{{ file.mtime }}</div></div>
      </div>
    </div>
  </article>
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
