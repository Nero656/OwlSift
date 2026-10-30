<script setup lang="ts">
import {useFiles} from "../composables/useFiles";
import NavigationButton from './nav_items/Navgation_button.vue'
import WorkersButton from './nav_items/Workers_button.vue'
import Sqlite_status from "./nav_items/Sqlite_status.vue";
import { useAiChats } from '../composables/useAiChats';

const {
  folders,
  selectedFolder
} = useFiles()

const route = useRoute()
const { settings } = useSettings()
const attachedIds = useState<number[]>('ai-attached-document-ids', () => [])
const { activeChatId, chats, sortMode, newChat, selectChat, renameChat, deleteChat: removeChat } = useAiChats(attachedIds)
const chatSidebarVisible = useState('ai-chat-sidebar-visible', () => true)
const previousCompact = useState<boolean | null>('ai-sidebar-previous-compact', () => null)
watch(() => route.path === '/ai_assistant', (inAssistant, wasInAssistant) => {
  if (inAssistant && !wasInAssistant) {
    previousCompact.value = settings.value.compactSidebar
    settings.value.compactSidebar = true
  } else if (!inAssistant && wasInAssistant && previousCompact.value !== null) {
    if (settings.value.compactSidebar) settings.value.compactSidebar = previousCompact.value
    previousCompact.value = null
  }
}, { immediate: true })
const { t } = useLanguage()
const setChatSort = (mode: 'recent' | 'oldest' | 'title') => { sortMode.value = mode }
const deleteChat = (key: string) => {
  if (import.meta.client && window.confirm(t('deleteChatConfirm'))) removeChat(key)
}
const isCompact = computed({
  get: () => settings.value.compactSidebar,
  set: value => { settings.value.compactSidebar = value },
})

const isActive = (item: { id: string; route: string }) => {
  if (item.id === 'search') {
    return route.path === '/'
  }

  return route.path === item.route ||
      route.path.startsWith(`${item.route}/`)
}

const navItems = computed(() => [
  {
    id: 'search',
    label: t('search'),
    route: '/',
    icon: 'lucide:search'
  },
  {
    id: 'folders',
    label: t('workspaces'),
    route: '/folders',
    icon: 'lucide:folder-git-2',
    badge: String(folders.value.length)
  },
  {
    id: 'documents',
    label: t('documentsPage'),
    route: '/documents',
    icon: 'lucide:files'
  },
  {
    id: 'ai',
    label: t('aiAssistant'),
    route: '/ai_assistant',
    icon: 'lucide:sparkles'
  },
  {
    id: 'notes',
    label: t('notesTags'),
    route: '/notes',
    icon: 'lucide:tags'
  },
  {
    id: 'settings',
    label: t('settings'),
    route: '/settings',
    icon: 'lucide:settings'
  }
])
</script>

<template>
  <div class="flex h-full shrink-0">
  <aside
      class="flex shrink-0 flex-col justify-between border-r border-surface-200 bg-white/50 transition-[width] duration-200 dark:border-surface-800 dark:bg-surface-900/50"
      :class="isCompact ? 'w-16' : 'w-64'"
  >
    <div :class="isCompact ? 'space-y-4 p-2' : 'space-y-6 p-3'">
      <!-- Navigation -->

      <nav class="space-y-1">
        <NavigationButton
            v-for="item in navItems"
            :key="item.id"
            :id="item.id"
            :label="item.label"
            :icon="item.icon"
            :route="item.route"
            :badge="item.badge"
            :active="isActive(item)"
            :compact="isCompact"
        />
      </nav>

      <!-- Workspaces -->

      <section v-if="!isCompact">
        <div
            class="mb-2 flex items-center justify-between
             px-3.5 text-[10px] font-bold
             uppercase tracking-wider text-surface-400"
        >
          <span>{{ t('workspaces') }}</span>

          <Icon
              name="lucide:folder"
              size="12"
          />
        </div>

        <div class="space-y-1">
          <WorkersButton
              v-for="folder in folders"
              :key="folder.path"
              :path="folder.path"
              :name="folder.name"
              :count="folder.count"
              :active="selectedFolder === folder.name"
              @select="selectedFolder = $event"
          />
        </div>
      </section>
    </div>

    <!-- System status -->

    <div>
      <Sqlite_status v-if="!isCompact" />
      <SupportDeveloper :compact="isCompact" />
      <div class="flex p-2" :class="isCompact ? 'justify-center border-t border-surface-200 dark:border-surface-800' : 'justify-end'">
        <button
          type="button"
          class="rounded-lg p-2 text-surface-500 transition hover:bg-surface-100 hover:text-surface-700 dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:text-surface-200"
          :title="isCompact ? t('expandSidebar') : t('collapseSidebar')"
          :aria-label="isCompact ? t('expandSidebar') : t('collapseSidebar')"
          :aria-pressed="isCompact"
          @click="isCompact = !isCompact"
        >
          <Icon :name="isCompact ? 'lucide:panel-left-open' : 'lucide:panel-left-close'" size="17" />
        </button>
      </div>
    </div>
  </aside>
  <Transition name="chat-sidebar">
    <aside v-if="route.path === '/ai_assistant' && chatSidebarVisible" class="chat-sidebar-panel flex min-w-0 shrink-0 flex-col overflow-hidden border-r border-surface-200 bg-surface-50/80 dark:border-surface-800 dark:bg-surface-950/40">
      <AiChatSwitcher :chats="chats" :active-key="activeChatId" :sort-mode="sortMode" @select="selectChat" @new="newChat" @rename="renameChat" @delete="deleteChat" @sort="setChatSort" />
    </aside>
  </Transition>
  </div>
</template>

<style scoped>
.chat-sidebar-panel { width: clamp(7rem, 24vw, 16rem); flex-basis: clamp(7rem, 24vw, 16rem); transition: width 220ms ease, flex-basis 220ms ease, opacity 180ms ease, transform 220ms ease; }
.chat-sidebar-enter-from, .chat-sidebar-leave-to { width: 0; flex-basis: 0; opacity: 0; transform: translateX(-8px); }
.chat-sidebar-enter-to, .chat-sidebar-leave-from { opacity: 1; transform: translateX(0); }
@media (prefers-reduced-motion: reduce) { .chat-sidebar-panel { transition: none; } }
</style>

