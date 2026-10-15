<script setup lang="ts">
const { language, setLanguage, t } = useLanguage()
const { maxFilesPerFolder } = useFiles()
const { settings, reset } = useSettings()
const { testConnection, connectionStatus, availableModels, lastError } = useAi()
const savedLabel = ref('')
const isTesting = ref(false)
const globalApiHost = computed(() => {
  try { return new URL(settings.value.globalModel.endpoint.trim()).host } catch { return '' }
})
const canTestModel = computed(() => settings.value.modelProvider === 'global' ? Boolean(settings.value.globalModel.endpoint.trim()) : settings.value.localModel.enabled && Boolean(settings.value.localModel.endpoint.trim()))

watch(settings, () => {
  savedLabel.value = t('settingsSaved')
  window.setTimeout(() => { savedLabel.value = '' }, 1800)
}, { deep: true })

const languageOptions = computed(() => [
  { value: 'ru' as const, label: t('russian') },
  { value: 'en' as const, label: t('english') },
])

const checkModel = async () => {
  isTesting.value = true
  try {
    await testConnection()
  } catch {
    // lastError is set in useAi
  } finally {
    isTesting.value = false
  }
}
</script>

<template>
  <div class="flex-1 overflow-y-auto p-6 md:p-10">
    <div class="mx-auto max-w-3xl">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">{{ t('settings') }}</h1>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ t('settingsDescription') }}</p>
        </div>
        <span v-if="savedLabel" class="text-xs font-medium text-emerald-600 dark:text-emerald-400">{{ savedLabel }}</span>
      </div>

      <section class="mt-8 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ t('language') }}</h2>
        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <button v-for="option in languageOptions" :key="option.value" type="button" class="flex items-center justify-between rounded-xl border px-4 py-3 text-sm transition-colors" :class="language === option.value ? 'border-emerald-500 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400' : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'" @click="setLanguage(option.value)">
            <span>{{ option.label }}</span><Icon v-if="language === option.value" name="lucide:check" size="16" />
          </button>
        </div>
      </section>

      <section class="mt-5 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ t('interfaceTitle') }}</h2>
        <div class="mt-4 grid gap-5 sm:grid-cols-2">
          <label class="text-sm text-gray-700 dark:text-gray-300">{{ t('theme') }}
            <AppDropdown v-model="settings.theme" :options="[{ value: 'dark', label: t('darkTheme') }, { value: 'light', label: t('lightTheme') }]" class="mt-2 w-full" />
          </label>
          <label class="text-sm text-gray-700 dark:text-gray-300">{{ t('defaultFileView') }}
            <AppDropdown v-model="settings.fileView" :options="[{ value: 'grid', label: t('gridView') }, { value: 'list', label: t('listView') }]" class="mt-2 w-full" />
          </label>
          <label class="flex items-center justify-between gap-3 text-sm text-gray-700 dark:text-gray-300 sm:col-span-2">
            <span>
              <span class="block font-medium">{{ t('compactSidebar') }}</span>
              <span class="mt-1 block text-xs text-gray-500">{{ t('compactSidebarDescription') }}</span>
            </span>
            <input v-model="settings.compactSidebar" type="checkbox" class="h-5 w-5 accent-emerald-600">
          </label>
          <label class="flex items-center justify-between gap-3 text-sm text-gray-700 dark:text-gray-300 sm:col-span-2">
            <span>
              <span class="block font-medium">{{ t('showThumbnails') }}</span>
              <span class="mt-1 block text-xs text-gray-500">{{ t('showThumbnailsDescription') }}</span>
            </span>
            <input v-model="settings.showThumbnails" type="checkbox" class="h-5 w-5 accent-emerald-600">
          </label>
        </div>
      </section>

      <section class="mt-5 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <label for="folder-file-limit" class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ t('folderLimitSetting') }}</label>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ t('folderLimitSettingDescription') }}</p>
        <AppDropdown v-model="maxFilesPerFolder" :options="[100, 500, 1000, 2500, 5000].map(value => ({ value, label: value.toLocaleString() }))" id="folder-file-limit" class="mt-4 w-full max-w-xs" />
      </section>

      <section class="mt-5 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ t('modelProviderTitle') }}</h2>
        <label class="mt-4 block max-w-md text-sm text-gray-700 dark:text-gray-300">{{ t('modelProvider') }}
          <AppDropdown v-model="settings.modelProvider" :options="[{ value: 'local', label: t('localModelOption') }, { value: 'global', label: t('globalModelOption') }]" class="mt-2 w-full" />
        </label>

        <template v-if="settings.modelProvider === 'local'">
          <div class="mt-5 flex items-start justify-between gap-4">
            <div>
              <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ t('localModelTitle') }}</h3>
              <p class="mt-1 text-xs text-gray-500">{{ t('localModelDescription') }}</p>
            </div>
            <input v-model="settings.localModel.enabled" type="checkbox" class="mt-1 h-5 w-5 accent-emerald-600" :aria-label="t('localModelTitle')">
          </div>
          <div class="mt-5 grid gap-4 sm:grid-cols-2" :class="!settings.localModel.enabled && 'opacity-50'">
            <label class="text-sm text-gray-700 dark:text-gray-300">{{ t('modelEndpoint') }}
              <input v-model.trim="settings.localModel.endpoint" :disabled="!settings.localModel.enabled" type="url" placeholder="http://127.0.0.1:1234/v1" class="mt-2 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800">
            </label>
            <label v-if="connectionStatus === 'ok'" class="text-sm text-gray-700 dark:text-gray-300">{{ t('modelName') }}
              <AppDropdown v-model="settings.localModel.model" :options="availableModels.map(value => ({ value, label: value }))" :placeholder="availableModels.length ? t('selectModel') : t('noModelsFound')" :disabled="availableModels.length === 0" class="mt-2 w-full" />
            </label>
            <p v-else class="self-end text-xs text-gray-500 sm:pb-3">{{ t('connectToChooseModel') }}</p>
            <label class="text-sm text-gray-700 dark:text-gray-300 sm:col-span-2">{{ t('systemPrompt') }}
              <textarea v-model="settings.localModel.systemPrompt" :disabled="!settings.localModel.enabled" rows="3" class="mt-2 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800" />
            </label>
          </div>
        </template>

        <div v-else class="mt-5 grid gap-4 sm:grid-cols-2">
          <p class="text-sm text-gray-600 dark:text-gray-300 sm:col-span-2">{{ t('globalModelDescription') }}</p>
          <label class="text-sm text-gray-700 dark:text-gray-300">{{ t('modelEndpoint') }}
            <input v-model.trim="settings.globalModel.endpoint" type="url" placeholder="https://api.openai.com/v1" class="mt-2 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800">
          </label>
          <label class="text-sm text-gray-700 dark:text-gray-300">{{ t('apiKey') }}
            <input v-model.trim="settings.globalModel.apiKey" type="password" autocomplete="off" spellcheck="false" autocapitalize="off" class="mt-2 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800">
          </label>
          <label v-if="connectionStatus === 'ok'" class="text-sm text-gray-700 dark:text-gray-300">{{ t('modelName') }}
            <AppDropdown v-model="settings.globalModel.model" :options="availableModels.map(value => ({ value, label: value }))" :placeholder="availableModels.length ? t('selectModel') : t('noModelsFound')" :disabled="availableModels.length === 0" class="mt-2 w-full" />
          </label>
          <p v-else class="self-end text-xs text-gray-500 sm:pb-3">{{ t('connectToChooseModel') }}</p>
          <label class="text-sm text-gray-700 dark:text-gray-300 sm:col-span-2">{{ t('systemPrompt') }}
            <textarea v-model="settings.globalModel.systemPrompt" rows="3" class="mt-2 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800" />
          </label>
          <p class="text-xs text-gray-500 sm:col-span-2">{{ t('globalProviderKeyHint') }} <span v-if="globalApiHost" class="font-mono">{{ globalApiHost }}</span></p>
          <p class="text-xs text-amber-600 dark:text-amber-400 sm:col-span-2">{{ t('globalApiHint') }}</p>
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" class="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50" :disabled="!canTestModel || isTesting" @click="checkModel">
            {{ isTesting ? t('sqliteChecking') : (settings.modelProvider === 'local' ? t('connectLmStudio') : t('testConnection')) }}
          </button>
          <p v-if="connectionStatus === 'ok'" class="text-xs text-emerald-600">{{ t('connectionOk') }} {{ availableModels.length }}</p>
          <p v-else-if="connectionStatus === 'error'" class="text-xs text-rose-500">{{ lastError }}</p>
        </div>
        <p v-if="settings.modelProvider === 'local'" class="mt-3 text-[11px] text-gray-400">{{ t('ollamaHint') }}</p>
        <AiConnectionGuide :provider="settings.modelProvider" />
      </section>

      <button type="button" class="mt-5 rounded-xl border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800" @click="reset">{{ t('resetInterface') }}</button>
    </div>
  </div>
</template>
