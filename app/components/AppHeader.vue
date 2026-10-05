<script setup lang="ts">
const { files, searchQuery } = useFiles()
const { t } = useLanguage()

const isDark = useState('dark-mode', () => true)

const toggleTheme = () => {
  isDark.value = !isDark.value

  if (isDark.value) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

const addFolder = () => {
  // Пока заглушка.
  // Позже здесь будет Electron IPC:
  // window.electron?.selectFolder()
}
</script>

<template>
  <header
      class="z-20 flex h-16 shrink-0 items-center justify-between
           border-b border-gray-200 bg-white/80 px-4 backdrop-blur-md
           dark:border-gray-800 dark:bg-gray-900/80"
  >
    <!-- Logo -->

    <div class="flex w-64 items-center gap-3">
      <div
          class="flex h-9 w-9 items-center justify-center rounded-xl
               bg-gradient-to-tr from-emerald-600 to-emerald-400
               text-lg font-bold text-white shadow-lg"
      >
        <Icon name="lucide:brain" size="20" />
      </div>

      <div>
        <div class="flex items-center gap-2">
          <span class="text-lg font-bold tracking-tight">
            LocalMind
          </span>

          <span
              class="rounded border border-emerald-500/20
                   bg-emerald-500/10 px-1.5 py-0.5
                   text-[10px] font-medium text-emerald-600
                   dark:text-emerald-400"
          >
            OFFLINE
          </span>
        </div>

        <p class="-mt-1 text-[11px] text-gray-500 dark:text-gray-400">
          Local-first AI Search
        </p>
      </div>
    </div>

    <!-- Search -->

    <div class="max-w-2xl flex-1 px-4">
      <div class="relative">
        <Icon
            name="lucide:search"
            size="16"
            class="absolute left-3.5 top-1/2
                 -translate-y-1/2 text-gray-400"
        />

        <input
            v-model="searchQuery"
            type="text"
            :placeholder="t('searchPlaceholder')"
            class="w-full rounded-xl border border-transparent
                 bg-gray-100 py-2 pl-10 pr-20 text-sm
                 outline-none transition-all
                 placeholder:text-gray-400
                 focus:border-emerald-500
                 focus:ring-2 focus:ring-emerald-500/20
                 dark:bg-gray-800/80"
        />

        <span
            class="absolute right-3 top-1/2
                 -translate-y-1/2 rounded-md border
                 border-gray-200 bg-white px-2 py-0.5
                 text-[11px] font-medium text-gray-400
                 dark:border-gray-600 dark:bg-gray-700"
        >
          ⌘K
        </span>
      </div>
    </div>

    <!-- Actions -->

    <div class="flex items-center gap-3">
      <div
          class="hidden items-center gap-2 rounded-lg
               bg-gray-100 px-3 py-1.5 text-xs
               text-gray-600 dark:bg-gray-800
               dark:text-gray-300 md:flex"
      >
        <span class="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
        {{ t('indexed') }} <strong>{{ files.length }}</strong> {{ t('files') }}
      </div>

      <button
          class="flex items-center gap-2 rounded-xl
               bg-emerald-600 px-3.5 py-2 text-xs
               font-semibold text-white shadow-md
               transition hover:bg-emerald-500
               active:scale-95"
          @click="addFolder"
      >
        <Icon name="lucide:folder-plus" size="16" />
        <span>{{ t('addFolder') }}</span>
      </button>

      <button
          class="rounded-xl p-2 text-gray-500 transition
               hover:bg-gray-100 hover:text-gray-700
               dark:text-gray-400 dark:hover:bg-gray-800
               dark:hover:text-gray-200"
          @click="toggleTheme"
      >
        <Icon
            :name="isDark ? 'lucide:sun' : 'lucide:moon'"
            size="20"
        />
      </button>
    </div>
  </header>
</template>
