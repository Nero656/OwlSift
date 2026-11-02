<script setup lang="ts">
import type { AiChatListItem } from '~/composables/useAiChats'

type ChatSortMode = 'recent' | 'oldest' | 'title'
defineProps<{ chats: AiChatListItem[]; activeKey: string | null; sortMode: ChatSortMode }>()
const emit = defineEmits<{ select: [key: string]; new: []; rename: [key: string, title: string]; delete: [key: string]; sort: [mode: ChatSortMode] }>()
const { t } = useLanguage()
const generation = useState('ai-generation', () => ({ key: '', stage: '', text: '', model: '' }))
const isThinking = useState('ai-thinking', () => false)
const editingKey = ref<string | null>(null)
const editTitle = ref('')
const sortOptions = computed(() => [
  { value: 'recent' as const, label: t('chatSortRecent') },
  { value: 'oldest' as const, label: t('chatSortOldest') },
  { value: 'title' as const, label: t('chatSortTitle') },
])
const startRename = (chat: AiChatListItem) => {
  editingKey.value = chat.key
  editTitle.value = chat.title
}
const saveRename = (key: string) => {
  const title = editTitle.value.trim()
  if (title) emit('rename', key, title)
  editingKey.value = null
}
const cancelRename = () => { editingKey.value = null; editTitle.value = '' }
const setSortMode = (mode: ChatSortMode) => emit('sort', mode)
const chatActions = (chat: AiChatListItem) => [[
  { label: t('renameChat'), icon: 'i-lucide-pencil', onSelect: () => startRename(chat) },
  { label: t('deleteChat'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('delete', chat.key) },
]]
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex shrink-0 items-center justify-between gap-2 border-b border-surface-200 px-3 py-3 dark:border-surface-800">
      <div class="flex min-w-0 items-center gap-2">
        <Icon name="lucide:messages-square" size="17" class="shrink-0 text-primary-500" />
        <h2 class="truncate text-sm font-semibold">{{ t('aiAssistant') }}</h2>
        <span class="shrink-0 rounded-full bg-surface-200 px-1.5 py-0.5 text-[10px] text-surface-500 dark:bg-surface-800">{{ chats.length }}</span>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <AppDropdown :model-value="sortMode" :options="sortOptions" class="w-28" :aria-label="t('sortChats')" @update:model-value="setSortMode" />
        <UButton type="button" icon="i-lucide-plus" size="sm" variant="soft" :aria-label="t('newChat')" :title="t('newChat')" @click="emit('new')" />
      </div>
    </div>
    <nav class="min-h-0 flex-1 space-y-1 overflow-y-auto p-2" :aria-label="t('switchChat')">
      <div v-for="chat in chats" :key="chat.key" class="group flex w-full min-w-0 items-start gap-1 rounded-xl border px-2 py-2 transition-colors" :class="chat.key === activeKey ? 'border-primary-500/30 bg-primary-500/10 text-primary-700 dark:text-primary-300' : 'border-transparent text-surface-600 hover:border-surface-200 hover:bg-white dark:text-surface-300 dark:hover:border-surface-800 dark:hover:bg-surface-900'">
        <template v-if="editingKey === chat.key">
          <Icon name="lucide:pencil" size="14" class="mt-1 shrink-0" />
          <input v-model="editTitle" class="min-w-0 flex-1 rounded-md border border-primary-500/40 bg-white px-1.5 py-1 text-xs text-surface-800 outline-none dark:bg-surface-900 dark:text-surface-100" maxlength="100" :aria-label="t('renameChat')" @click.stop @keydown.enter.prevent="saveRename(chat.key)" @keydown.esc.prevent="cancelRename">
          <UButton type="button" icon="i-lucide-check" size="xs" color="primary" variant="soft" :aria-label="t('saveChatName')" @click="saveRename(chat.key)" />
          <UButton type="button" icon="i-lucide-x" size="xs" color="neutral" variant="ghost" :aria-label="t('cancel')" @click="cancelRename" />
        </template>
        <template v-else>
          <button type="button" class="flex min-w-0 flex-1 items-start gap-2 text-left" :aria-current="chat.key === activeKey ? 'page' : undefined" @click="emit('select', chat.key)">
            <Icon :name="isThinking && generation.key === chat.key ? 'lucide:loader-circle' : chat.fileCount ? 'lucide:files' : 'lucide:message-square'" size="15" class="mt-0.5 shrink-0" :class="{ 'animate-spin': isThinking && generation.key === chat.key }" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-xs font-medium">{{ chat.title }}</span>
              <span class="mt-1 block truncate text-[10px] opacity-65">{{ chat.preview }}</span>
              <span v-if="chat.fileCount" class="mt-1 block truncate text-[10px] opacity-55">{{ t('selectedContextFiles') }} {{ chat.fileCount }}</span>
            </span>
          </button>
          <UDropdownMenu :items="chatActions(chat)" :content="{ align: 'end', side: 'bottom', sideOffset: 4, collisionPadding: 12, avoidCollisions: true }" :ui="{ content: 'z-[150]', item: 'cursor-pointer' }">
            <UButton type="button" icon="i-lucide-ellipsis" size="xs" color="neutral" variant="ghost" class="shrink-0 opacity-60 hover:opacity-100" :aria-label="t('chatActions')" :title="t('chatActions')" @click.stop />
          </UDropdownMenu>
        </template>
      </div>
      <p v-if="!chats.length" class="px-2 py-5 text-center text-xs text-surface-500">{{ t('emptyChat') }}</p>
    </nav>
  </div>
</template>