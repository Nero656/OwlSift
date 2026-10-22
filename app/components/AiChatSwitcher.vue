<script setup lang="ts">
import type { AiChatListItem } from '~/composables/useAiChats'
const props = defineProps<{ chats: AiChatListItem[]; activeKey: string | null }>()
const emit = defineEmits<{ select: [key: string]; new: [] }>()
const { t } = useLanguage()
const generation = useState('ai-generation', () => ({ key: '', stage: '', text: '', model: '' }))
const isThinking = useState('ai-thinking', () => false)
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex shrink-0 items-center justify-between gap-2 border-b border-surface-200 px-3 py-3 dark:border-surface-800">
      <div class="flex min-w-0 items-center gap-2">
        <Icon name="lucide:messages-square" size="17" class="shrink-0 text-primary-500" />
        <h2 class="truncate text-sm font-semibold">{{ t('aiAssistant') }}</h2>
        <span class="shrink-0 rounded-full bg-surface-200 px-1.5 py-0.5 text-[10px] text-surface-500 dark:bg-surface-800">{{ chats.length }}</span>
      </div>
      <UButton type="button" icon="i-lucide-plus" size="sm" variant="soft" :aria-label="t('newChat')" :title="t('newChat')" @click="emit('new')" />
    </div>
    <nav class="min-h-0 flex-1 space-y-1 overflow-y-auto p-2" :aria-label="t('switchChat')">
      <button v-for="chat in chats" :key="chat.key" type="button" class="group flex w-full min-w-0 items-start gap-2 rounded-xl border px-2.5 py-2.5 text-left transition-colors" :class="chat.key === activeKey ? 'border-primary-500/30 bg-primary-500/10 text-primary-700 dark:text-primary-300' : 'border-transparent text-surface-600 hover:border-surface-200 hover:bg-white dark:text-surface-300 dark:hover:border-surface-800 dark:hover:bg-surface-900'" :aria-current="chat.key === activeKey ? 'page' : undefined" @click="emit('select', chat.key)">
        <Icon :name="isThinking && generation.key === chat.key ? 'lucide:loader-circle' : chat.fileCount ? 'lucide:files' : 'lucide:message-square'" size="15" class="mt-0.5 shrink-0" :class="{ 'animate-spin': isThinking && generation.key === chat.key }" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-xs font-medium">{{ chat.title }}</span>
          <span class="mt-1 block truncate text-[10px] opacity-65">{{ chat.preview }}</span>
          <span v-if="chat.fileCount" class="mt-1 block truncate text-[10px] opacity-55">{{ t('selectedContextFiles') }} {{ chat.fileCount }}</span>
        </span>
      </button>
      <p v-if="!chats.length" class="px-2 py-5 text-center text-xs text-surface-500">{{ t('emptyChat') }}</p>
    </nav>
  </div>
</template>

