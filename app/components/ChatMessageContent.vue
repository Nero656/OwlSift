<script setup lang="ts">
import type { ChatFileReference } from '~/types/file'
import { chatContentParts, safeChatUrl } from '~/utils/chatContent'
import { stripGeneratedFileSummary } from '~/utils/generatedFileSummary'
const props = withDefaults(defineProps<{ text: string; references?: ChatFileReference[]; pendingFile?: ChatFileReference }>(), { references: () => [] })
const previewReferences = computed(() => [...props.references, ...(props.pendingFile ? [props.pendingFile] : [])])
const { files } = useFiles()
const { t } = useLanguage()
const failedImages = ref(new Set<string>())
const linkError = ref('')
const normalize = (value: string) => {
  try { value = decodeURIComponent(value) } catch { /* Keep literal filenames if URL decoding fails. */ }
  return value.replace(/^file:\/\//i, '').replace(/^\/([a-z]:\/)/i, '$1').replace(/\\/g, '/')
}
const localFile = (url: string): ChatFileReference | undefined => {
  if (/^https?:|^data:/i.test(url)) return undefined
  const value = normalize(url)
  const id = /^(?:owlsift-file|localmind-file):(\d+)$/.exec(value)
  if (id) return files.value.find(file => file.id === Number(id[1]))
  const exact = files.value.find(file => normalize(file.path) === value)
  if (exact) return exact
  const name = value.split('/').pop()
  return previewReferences.value.find(file => file.name === name) ?? (!value.includes('/') && !value.includes(':') ? files.value.find(file => file.name === value) : undefined)
}
const parts = computed(() => chatContentParts(stripGeneratedFileSummary(props.text, previewReferences.value), previewReferences.value).map(part => {
  if (part.kind !== 'link' && part.kind !== 'image') return { ...part, file: undefined, href: undefined }
  const file = localFile(part.url)
  return { ...part, file, href: file ? undefined : safeChatUrl(part.url, part.kind === 'image') }
}))
const openExternal = async (event: MouseEvent, href: string) => {
  if (!window.electron || href.startsWith('data:')) return
  event.preventDefault()
  try { linkError.value = ''; await window.electron.invoke('app:open-external', href) }
  catch { linkError.value = t('chatLinkOpenError') }
}
</script>

<template>
  <div class="min-w-0 max-w-full break-words [overflow-wrap:anywhere]">
    <template v-for="(part, index) in parts" :key="index">
      <span v-if="part.kind === 'text'" class="whitespace-pre-wrap">{{ part.text }}</span>
      <pre v-else-if="part.kind === 'code'" class="my-2 max-w-full overflow-x-auto rounded-lg bg-black/10 p-3 text-xs"><code>{{ part.text }}</code></pre>
      <code v-else-if="part.kind === 'inlineCode'" class="rounded bg-black/10 px-1 py-0.5">{{ part.text }}</code>
      <ChatFileAttachment v-else-if="part.file" :file="part.file" :label="part.text || part.file.name" class="my-2" />
      <a v-else-if="part.href" :href="part.href" target="_blank" rel="noopener noreferrer" :download="part.href.startsWith('data:') ? 'image.png' : undefined" :title="part.href.startsWith('data:') ? t('chatImage') : part.href" class="underline underline-offset-4" @click="openExternal($event, part.href ?? '')">
        <span v-if="part.kind === 'image'" class="my-2 block space-y-1">
          <img v-if="!failedImages.has(part.href)" :src="part.href" :alt="part.text || t('chatImage')" loading="lazy" referrerpolicy="no-referrer" class="max-h-80 max-w-full rounded-lg object-contain" @error="part.href && failedImages.add(part.href)">
          <span class="text-xs">{{ part.text || t('chatImage') }}</span>
        </span>
        <template v-else>{{ part.text || part.href }}</template>
      </a>
      <span v-else>{{ part.text }}</span>
    </template>
    <p v-if="linkError" role="alert" class="mt-2 text-xs text-rose-500">{{ linkError }}</p>
  </div>
</template>
