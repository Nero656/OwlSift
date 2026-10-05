<script setup lang="ts">
import AppHeader from './components/AppHeader.vue'
import Sidebar from './components/Sidebar.vue'
// import SearchToolbar from '/components/SearchToolbar.vue'
import AiPanel from './components/AiPanel.vue'
</script>

<template>
  <div class="h-screen overflow-hidden bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
    <div class="flex h-full flex-col">
      <AppHeader />

      <div class="flex min-h-0 flex-1">
        <Sidebar />

        <main class="flex min-w-0 flex-1 flex-col overflow-hidden bg-white dark:bg-gray-900">
          <NuxtPage/>
        </main>

        <AiPanel />
      </div>
    </div>
  </div>
</template>