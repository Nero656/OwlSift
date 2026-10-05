<script setup lang="ts">
import Sidebar from "./components/Sidebar.vue";
import type {SplitterItem, NavigationMenuItem} from '@nuxt/ui'


const footerItems: NavigationMenuItem[] = [
  {
    label: 'Figma Kit',
    to: 'https://go.nuxt.com/figma-ui',
    target: '_blank'
  },
  {
    label: 'Playground',
    to: 'https://stackblitz.com/edit/nuxt-ui',
    target: '_blank'
  },
  {
    label: 'Releases',
    to: 'https://github.com/nuxt/ui/releases',
    target: '_blank'
  }
]

const items: SplitterItem[] = [
  {
    slot: 'sidebar',
    sizeUnit: 'px', minSize: 150,
    defaultSize: 250,
    collapsible: true,
    collapsedSize: 48,
    class: 'bg-elevated/50 border border-default rounded-xl'
  },
  {
    slot: 'main', class: 'bg-elevated/50 border ' +
        'border-default rounded-xl items-center ' +
        'justify-center text-muted font-medium'
  }
]

function iconName(theme) {
  if (theme === 'system') return 'i-ph-laptop'
  if (theme === 'light') return 'i-ph-sun'
  if (theme === 'dark') return 'i-ph-moon'
  return 'i-ph-coffee'
}
</script>

<template>
  <UApp>
    <UHeader/>
    <USplitter id="splitter-collapsible-example" :items="items" class="height-3">


      <template #sidebar="{ collapsed, collapse, expand }" >

        <div class="flex-1 flex items-center justify-center p-2">
          <UButton
              :icon="collapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'"
              :label="collapsed ? undefined : 'Collapse'"
              :aria-label="collapsed ? 'Expand' : undefined"
              color="neutral"
              variant="subtle"
              @click="collapsed ? expand() : collapse()"
          />
        </div>
<!--        <Sidebar/>-->
      </template>
      <template #main>
        <UMain>
          <NuxtPage/>
        </UMain>
      </template>
    </USplitter>
    <UFooter>
      <template #left>
        <p class="text-muted text-sm">Copyright © {{ new Date().getFullYear() }}</p>
      </template>

      <div class="flex justify-center gap-2.5 mt-5">
        <button
            v-for="theme of ['system', 'light', 'dark', 'sepia']"
            :key="theme"
            class="relative top-0 cursor-pointer p-2 bg-white dark:bg-gray-800 sepia:bg-[#eae0c9] border-2 border-gray-200 dark:border-gray-700 sepia:border-[#ded0bf] rounded-md transition-all duration-100 ease-in-out hover:-top-1 flex"
            :class="{
          'border-red-600! dark:border-red-400! sepia:border-[#6b4c2a]! -top-1!': !$colorMode.unknown && theme === $colorMode.preference,
          'text-red-600 dark:text-red-400 sepia:text-[#6b4c2a]': !$colorMode.unknown && theme === $colorMode.value,
        }"
            @click="$colorMode.preference = theme"
        >
          <UIcon
              :name="iconName(theme)"
              class="size-6"
          />
        </button>
      </div>

      <template #right>
        <UButton
            icon="i-simple-icons-discord"
            color="neutral"
            variant="ghost"
            to="https://go.nuxt.com/discord"
            target="_blank"
            aria-label="Discord"
        />
        <UButton
            icon="i-simple-icons-x"
            color="neutral"
            variant="ghost"
            to="https://go.nuxt.com/x"
            target="_blank"
            aria-label="X"
        />
        <UButton
            icon="i-simple-icons-github"
            color="neutral"
            variant="ghost"
            to="https://github.com/nuxt/nuxt"
            target="_blank"
            aria-label="GitHub"
        />


      </template>
    </UFooter>
  </UApp>
</template>
