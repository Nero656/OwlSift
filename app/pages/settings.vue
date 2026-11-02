<script setup lang="ts">
import { getLanguageName, supportedLanguages } from '~/composables/useLanguage'
import type { GlobalApiProvider } from '~/composables/useSettings'
const { language, setLanguage, t } = useLanguage()
const { maxFilesPerFolder } = useFiles()
const { settings, reset } = useSettings()
const { testConnection, connectionStatus, availableModels, lastError } = useAi()
const activeTab = useState<string | number>('settings-active-tab', () => 'general')
const tabs = computed(() => [
  { label: t('generalTab'), value: 'general', slot: 'general' as const, icon: 'i-lucide-settings-2' },
  { label: t('appearanceTab'), value: 'appearance', slot: 'appearance' as const, icon: 'i-lucide-palette' },
  { label: t('filesTab'), value: 'files', slot: 'files' as const, icon: 'i-lucide-folder' },
  { label: t('aiModelsTab'), value: 'ai', slot: 'ai' as const, icon: 'i-lucide-bot' },
  { label: t('comfyTab'), value: 'comfy', slot: 'comfy' as const, icon: 'i-lucide-image' },
])
const savedLabel = ref('')
const isTesting = ref(false)
let savedTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => { if (savedTimer) clearTimeout(savedTimer) })
const globalApiHost = computed(() => {
  try { return new URL(settings.value.globalModel.endpoint.trim()).host } catch { return '' }
})
const canTestModel = computed(() => settings.value.modelProvider === 'global' ? Boolean(settings.value.globalModel.endpoint.trim()) : settings.value.localModel.enabled && Boolean(settings.value.localModel.endpoint.trim()))
const localProviderSelection = computed({
  get: () => settings.value.localModel.provider,
  set: (provider: 'lmstudio' | 'ollama') => {
    const config = settings.value.localModel
    const knownEndpoints = ['http://127.0.0.1:1234/v1', 'http://localhost:11434', 'http://127.0.0.1:11434']
    const currentEndpoint = config.endpoint.replace(/\/+$/, '')
    config.provider = provider
    if (!currentEndpoint || knownEndpoints.includes(currentEndpoint)) config.endpoint = provider === 'ollama' ? 'http://localhost:11434' : 'http://127.0.0.1:1234/v1'
    config.model = ''
  },
})

watch(settings, () => {
  savedLabel.value = t('settingsSaved')
  if (savedTimer) clearTimeout(savedTimer)
  savedTimer = setTimeout(() => { savedLabel.value = '' }, 1800)
}, { deep: true })

const responseToastDurations = [3000, 5000, 8000, 10000]
const responseToastDurationOptions = computed(() => responseToastDurations.map(value => ({ value, label: `${value / 1000} ${t('seconds')}` })))
const languageOptions = computed(() => supportedLanguages.map(option => ({
  ...option,
  label: getLanguageName(option.value, language.value),
})))
const providerEndpoints: Record<GlobalApiProvider, string> = {
  openai: 'https://api.openai.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  deepseek: 'https://api.deepseek.com',
}
const globalProviderSelection = computed({
  get: () => settings.value.globalModel.provider,
  set: (provider: GlobalApiProvider) => {
    const config = settings.value.globalModel
    if (config.apiKey) config.providerKeys[config.provider] = config.apiKey
    const isKnownEndpoint = Object.values(providerEndpoints).includes(config.endpoint.replace(/\/+$/, ''))
    config.provider = provider
    config.apiKey = config.providerKeys[provider] ?? ''
    config.model = ''
    if (isKnownEndpoint || !config.endpoint.trim()) config.endpoint = providerEndpoints[provider]
  },
})
watch(() => settings.value.globalModel.apiKey, key => {
  settings.value.globalModel.providerKeys[settings.value.globalModel.provider] = key
})
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
  <div class="flex-1 min-w-0 overflow-y-auto p-4 sm:p-6 md:p-10">
    <div class="mx-auto max-w-3xl">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-100">{{ t('settings') }}</h1>
          <p class="mt-1 text-sm text-surface-500 dark:text-surface-400">{{ t('settingsDescription') }}</p>
        </div>
        <span v-if="savedLabel" role="status" class="text-xs font-medium text-primary-600 dark:text-primary-400">{{ savedLabel }}</span>
      </div>

      <UTabs v-model="activeTab" :items="tabs" :unmount-on-hide="false" variant="link" class="mt-6 w-full min-w-0" :ui="{ list: 'grid grid-cols-2 gap-1 sm:flex sm:flex-wrap', indicator: 'hidden', trigger: 'min-w-0 flex-1 px-3 data-[state=active]:bg-primary-500/10', content: 'pt-5' }">
        <template #general>
          <section class="rounded-2xl border border-surface-200 bg-white p-4 sm:p-6 dark:border-surface-800 dark:bg-surface-900">
            <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">{{ t('language') }}</h2>
            <div class="mt-4 grid gap-3 sm:grid-cols-2">
              <button v-for="option in languageOptions" :key="option.value" type="button" class="flex items-center justify-between rounded-xl border px-4 py-3 text-sm transition-colors" :class="language === option.value ? 'border-primary-500 bg-primary-500/5 text-primary-700 dark:text-primary-400' : 'border-surface-200 text-surface-700 hover:bg-surface-50 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800'" @click="setLanguage(option.value)">
                <span>{{ option.label }}</span><Icon v-if="language === option.value" name="lucide:check" size="16" />
              </button>
            </div>
          </section>
          <section class="mt-5 rounded-2xl border border-surface-200 bg-white p-4 sm:p-6 dark:border-surface-800 dark:bg-surface-900">
            <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">{{ t('aiResponseNotificationsTitle') }}</h2>
            <UCheckbox v-model="settings.aiResponseNotifications" :label="t('aiResponseNotifications')" :aria-label="t('aiResponseNotifications')" :description="t('aiResponseNotificationsDescription')" indicator="end" size="lg" class="mt-4 flex items-center justify-between gap-4 text-sm text-surface-700 dark:text-surface-300" :ui="{ wrapper: 'flex-1', label: 'font-medium', description: 'text-xs' }" />
            <label class="mt-5 block max-w-sm text-sm text-surface-700 dark:text-surface-300" :class="!settings.aiResponseNotifications && 'opacity-50'">{{ t('aiResponseToastDuration') }}
              <AppDropdown v-model="settings.aiResponseToastDuration" :options="responseToastDurationOptions" :disabled="!settings.aiResponseNotifications" class="mt-2 w-full" />
            </label>
          </section>
        </template>
        <template #appearance>
          <section class="rounded-2xl border border-surface-200 bg-white p-4 sm:p-6 dark:border-surface-800 dark:bg-surface-900">
            <h2 class="text-sm font-semibold">{{ t('interfaceTitle') }}</h2>
            <label class="mt-4 block max-w-sm text-sm text-surface-700 dark:text-surface-300">{{ t('theme') }}
              <AppDropdown v-model="settings.theme" :options="[
                { value: 'dark', label: t('darkTheme') },
                { value: 'light', label: t('lightWhite') },
                { value: 'light-cloud', label: t('lightCloud') },
                { value: 'light-silver', label: t('lightSilver') },
                { value: 'light-ash', label: t('lightAsh') },
                { value: 'light-stone', label: t('lightStone') },
              ]" class="mt-2 w-full" />
            </label>
            <UCheckbox v-model="settings.compactSidebar" :label="t('compactSidebar')" :aria-label="t('compactSidebar')" :description="t('compactSidebarDescription')" indicator="end" size="lg" class="mt-5 flex items-center justify-between gap-3 text-sm text-surface-700 dark:text-surface-300" :ui="{ wrapper: 'flex-1', label: 'font-medium', description: 'text-xs' }" />
            <ThemeCustomizer />
          </section>
        </template>
        <template #files>
          <section class="rounded-2xl border border-surface-200 bg-white p-4 sm:p-6 dark:border-surface-800 dark:bg-surface-900">
            <h2 class="text-sm font-semibold">{{ t('filesTab') }}</h2>
            <div class="mt-4 grid gap-5 sm:grid-cols-2">
              <label class="text-sm text-surface-700 dark:text-surface-300">{{ t('defaultFileView') }}
                <AppDropdown v-model="settings.fileView" :options="[{ value: 'grid', label: t('gridView') }, { value: 'list', label: t('listView') }]" class="mt-2 w-full" />
              </label>
              <label class="text-sm text-surface-700 dark:text-surface-300">{{ t('filesPerPage') }}
                <AppDropdown v-model="settings.pageSize" :options="[25, 50, 100].map(value => ({ value, label: String(value) }))" class="mt-2 w-full" />
              </label>
              <UCheckbox v-model="settings.showThumbnails" :label="t('showThumbnails')" :aria-label="t('showThumbnails')" :description="t('showThumbnailsDescription')" indicator="end" size="lg" class="flex items-center justify-between gap-3 text-sm text-surface-700 dark:text-surface-300 sm:col-span-2" :ui="{ wrapper: 'flex-1', label: 'font-medium', description: 'text-xs' }" />
              <UCheckbox v-model="settings.showSystemFiles" :label="t('showSystemFiles')" :aria-label="t('showSystemFiles')" :description="t('showSystemFilesDescription')" indicator="end" size="lg" class="flex items-center justify-between gap-3 text-sm text-surface-700 dark:text-surface-300 sm:col-span-2" :ui="{ wrapper: 'flex-1', label: 'font-medium', description: 'text-xs' }" />
            </div>
          </section>
          <section class="mt-5 rounded-2xl border border-surface-200 bg-white p-4 sm:p-6 dark:border-surface-800 dark:bg-surface-900">
            <label for="folder-file-limit" class="text-sm font-semibold text-surface-900 dark:text-surface-100">{{ t('folderLimitSetting') }}</label>
            <p class="mt-1 text-xs text-surface-500 dark:text-surface-400">{{ t('folderLimitSettingDescription') }}</p>
            <AppDropdown v-model="maxFilesPerFolder" :options="[100, 500, 1000, 2500, 5000].map(value => ({ value, label: value.toLocaleString() }))" id="folder-file-limit" class="mt-4 w-full max-w-xs" />
          </section>
        </template>
        <template #ai>
          <section class="rounded-2xl border border-surface-200 bg-white p-4 sm:p-6 dark:border-surface-800 dark:bg-surface-900">
            <h2 class="text-sm font-semibold text-surface-900 dark:text-surface-100">{{ t('modelProviderTitle') }}</h2>
            <label class="mt-4 block max-w-md text-sm text-surface-700 dark:text-surface-300">{{ t('modelProvider') }}
              <AppDropdown v-model="settings.modelProvider" :options="[{ value: 'local', label: t('localModelOption') }, { value: 'global', label: t('globalModelOption') }]" class="mt-2 w-full" />
            </label>

            <template v-if="settings.modelProvider === 'local'">
              <div class="mt-5 flex items-start justify-between gap-4">
                <div>
                  <h3 class="text-sm font-semibold text-surface-900 dark:text-surface-100">{{ t('localModelTitle') }}</h3>
                  <p class="mt-1 text-xs text-surface-500">{{ settings.localModel.provider === 'ollama' ? t('ollamaModelDescription') : t('localModelDescription') }}</p>
                </div>
                <UCheckbox v-model="settings.localModel.enabled" size="lg" class="mt-1" :aria-label="t('localModelTitle')" />
              </div>
              <div class="mt-5 grid gap-4 sm:grid-cols-2" :class="!settings.localModel.enabled && 'opacity-50'">
                <label class="text-sm text-surface-700 dark:text-surface-300 sm:col-span-2">{{ t('localBackend') }}
                  <AppDropdown v-model="localProviderSelection" :options="[{ value: 'lmstudio', label: 'LM Studio' }, { value: 'ollama', label: 'Ollama' }]" :disabled="!settings.localModel.enabled" class="mt-2 w-full max-w-md" />
                </label>
                <label class="text-sm text-surface-700 dark:text-surface-300">{{ t('modelEndpoint') }}
                  <input v-model.trim="settings.localModel.endpoint" :disabled="!settings.localModel.enabled" type="url"  :placeholder="settings.localModel.provider === 'ollama' ? 'http://localhost:11434' : 'http://127.0.0.1:1234/v1'" class="mt-2 block w-full rounded-xl border border-surface-200 bg-surface-50 px-3 py-2.5 dark:border-surface-700 dark:bg-surface-800">
                </label>
                <label v-if="connectionStatus === 'ok'" class="text-sm text-surface-700 dark:text-surface-300">{{ t('modelName') }}
                  <AppDropdown v-model="settings.localModel.model" :options="availableModels.map(value => ({ value, label: value }))" :placeholder="availableModels.length ? t('selectModel') : t('noModelsFound')" :disabled="availableModels.length === 0" class="mt-2 w-full" />
                </label>
                <p v-else class="self-end text-xs text-surface-500 sm:pb-3">{{ t('connectToChooseModel') }}</p>
                <label class="text-sm text-surface-700 dark:text-surface-300 sm:col-span-2">{{ t('systemPrompt') }}
                  <textarea v-model="settings.localModel.systemPrompt" :disabled="!settings.localModel.enabled" rows="3" class="mt-2 block w-full rounded-xl border border-surface-200 bg-surface-50 px-3 py-2.5 dark:border-surface-700 dark:bg-surface-800" />
                </label>
              </div>
        </template>

        <div v-else class="mt-5 grid gap-4 sm:grid-cols-2">
          <p class="text-sm text-surface-600 dark:text-surface-300 sm:col-span-2">{{ t('globalModelDescription') }}</p>
          <label class="text-sm text-surface-700 dark:text-surface-300 sm:col-span-2">{{ t('modelProvider') }}
            <AppDropdown v-model="globalProviderSelection" :options="[
              { value: 'openai', label: 'OpenAI' },
              { value: 'gemini', label: 'Gemini' },
              { value: 'deepseek', label: 'DeepSeek' },
            ]" class="mt-2 w-full max-w-md" />
          </label>
          <label class="text-sm text-surface-700 dark:text-surface-300">{{ t('modelEndpoint') }}
            <input v-model.trim="settings.globalModel.endpoint" type="url" :placeholder="providerEndpoints[settings.globalModel.provider]" class="mt-2 block w-full rounded-xl border border-surface-200 bg-surface-50 px-3 py-2.5 dark:border-surface-700 dark:bg-surface-800">
          </label>
          <label class="text-sm text-surface-700 dark:text-surface-300">{{ t('apiKey') }}
            <input v-model.trim="settings.globalModel.apiKey" type="password" autocomplete="off" spellcheck="false" autocapitalize="off" class="mt-2 block w-full rounded-xl border border-surface-200 bg-surface-50 px-3 py-2.5 dark:border-surface-700 dark:bg-surface-800">
          </label>
          <label v-if="connectionStatus === 'ok'" class="text-sm text-surface-700 dark:text-surface-300">{{ t('modelName') }}
            <AppDropdown v-model="settings.globalModel.model" :options="availableModels.map(value => ({ value, label: value }))" :placeholder="availableModels.length ? t('selectModel') : t('noModelsFound')" :disabled="availableModels.length === 0" class="mt-2 w-full" />
          </label>
          <p v-else class="self-end text-xs text-surface-500 sm:pb-3">{{ t('connectToChooseModel') }}</p>
          <label class="text-sm text-surface-700 dark:text-surface-300 sm:col-span-2">{{ t('systemPrompt') }}
            <textarea v-model="settings.globalModel.systemPrompt" rows="3" class="mt-2 block w-full rounded-xl border border-surface-200 bg-surface-50 px-3 py-2.5 dark:border-surface-700 dark:bg-surface-800" />
          </label>
          <p class="text-xs text-surface-500 sm:col-span-2">{{ t('globalProviderKeyHint') }} <span v-if="globalApiHost" class="font-mono">{{ globalApiHost }}</span></p>
          <p class="text-xs text-amber-600 dark:text-amber-400 sm:col-span-2">{{ t('globalApiHint') }}</p>
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" class="rounded-xl bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-50" :disabled="!canTestModel || isTesting" @click="checkModel">
            {{ isTesting ? t('sqliteChecking') : (settings.modelProvider === 'local' ? (settings.localModel.provider === 'ollama' ? t('connectOllama') : t('connectLmStudio')) : t('testConnection')) }}
          </button>
          <p v-if="connectionStatus === 'ok'" class="text-xs text-primary-600">{{ t('connectionOk') }} {{ availableModels.length }}</p>
          <p v-else-if="connectionStatus === 'error'" class="text-xs text-rose-500">{{ lastError }}</p>
        </div>
        <AiConnectionGuide :provider="settings.modelProvider" :local-provider="settings.localModel.provider" />
      </section>
        </template>
        <template #comfy><ComfySettings v-if="activeTab === 'comfy'" /></template>
      </UTabs>

      <button type="button" class="mt-5 rounded-xl border border-surface-200 px-4 py-2 text-xs font-medium text-surface-600 transition hover:bg-surface-100 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800" @click="reset">{{ t('resetInterface') }}</button>
    </div>
  </div>
</template>
