<script setup lang="ts">
import {useFiles} from "../composables/useFiles";
import NavigationButton from './nav_items/Navgation_button.vue'
import WorkersButton from './nav_items/Workers_button.vue'
import Sqlite_status from "./nav_items/Sqlite_status.vue";

const {
  folders,
  selectedFolder
} = useFiles()

const route = useRoute()
const { t } = useLanguage()

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
    badge: '3'
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
  <aside
      class="flex w-64 shrink-0 flex-col justify-between
           border-r border-gray-200 bg-white/50
           dark:border-gray-800 dark:bg-gray-900/50"
  >
    <div class="space-y-6 p-3">

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
        />
      </nav>

      <!-- Workspaces -->

      <section>
        <div
            class="mb-2 flex items-center justify-between
             px-3.5 text-[10px] font-bold
             uppercase tracking-wider text-gray-400"
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

    <Sqlite_status/>
  </aside>
</template>
