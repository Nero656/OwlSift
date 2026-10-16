<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { AiChatListItem } from '~/composables/useAiChats'
const props = defineProps<{ chats: AiChatListItem[]; activeKey: string | null }>()
const emit = defineEmits<{ select: [key: string]; new: [] }>()
const { t } = useLanguage()
const generation = useState('ai-generation', () => ({ key: '', stage: '', text: '', model: '' }))
const isThinking = useState('ai-thinking', () => false)
const activeChat = computed(() => props.chats.find(chat => chat.key === props.activeKey))
const items = computed<DropdownMenuItem[]>(() => props.chats.map(chat => ({
  label: chat.title,
  description: (chat.fileCount ? t('selectedContextFiles') + ' ' + chat.fileCount + ' · ' : '') + chat.preview,
  icon: isThinking.value && generation.value.key === chat.key ? 'i-lucide-loader-circle' : chat.fileCount ? 'i-lucide-files' : 'i-lucide-message-square',
  type: 'checkbox', checked: chat.key === props.activeKey,
  onSelect: () => emit('select', chat.key),
})))
</script>

<template>
  <div class="mb-4 flex min-w-0 flex-wrap items-center gap-2">
    <UDropdownMenu :items="items" :filter="{ placeholder: t('searchChats') }" :filter-fields="['label', 'description']" :modal="false" :content="{ align: 'start', sideOffset: 6, collisionPadding: 12 }" :ui="{ content: 'z-[150] w-[min(30rem,calc(100vw-2rem))] max-h-[min(24rem,var(--reka-dropdown-menu-content-available-height))] overflow-y-auto', itemLabel: 'truncate', itemDescription: 'truncate' }">
      <UButton type="button" color="neutral" variant="outline" class="min-w-0 max-w-full flex-1 justify-between sm:max-w-md" :aria-label="t('switchChat')">
        <span class="flex min-w-0 items-center gap-2"><Icon name="lucide:messages-square" size="16" class="shrink-0" /><span class="truncate">{{ activeChat?.title ?? t('generalChat') }}</span></span>
        <Icon name="lucide:chevron-down" size="15" class="shrink-0" />
      </UButton>
    </UDropdownMenu>
    <UButton type="button" icon="i-lucide-plus" variant="soft" @click="emit('new')">{{ t('newChat') }}</UButton>
    <span class="text-[11px] text-surface-400">{{ t('chatCount') }} {{ chats.length }}</span>
  </div>
</template>
