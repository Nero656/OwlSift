<script setup lang="ts">
const { language, setLanguage, t } = useLanguage()
const languageOptions = computed(() => [
  { value: 'ru' as const, label: t('russian') },
  { value: 'en' as const, label: t('english') },
])
</script>

<template>
  <div class="flex-1 overflow-y-auto p-6 md:p-10">
    <div class="mx-auto max-w-3xl">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">{{ t('settings') }}</h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ t('languageDescription') }}</p>

      <section class="mt-8 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ t('language') }}</h2>
        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            v-for="option in languageOptions"
            :key="option.value"
            type="button"
            class="flex items-center justify-between rounded-xl border px-4 py-3 text-sm transition-colors"
            :class="language === option.value
              ? 'border-emerald-500 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
              : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'"
            :aria-pressed="language === option.value"
            @click="setLanguage(option.value)"
          >
            <span>{{ option.label }}</span>
            <Icon v-if="language === option.value" name="lucide:check" size="16" />
          </button>
        </div>
      </section>
    </div>
  </div>
</template>
