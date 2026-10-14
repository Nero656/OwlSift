<script setup lang="ts">
const { language, setLanguage, t } = useLanguage()
const { maxFilesPerFolder } = useFiles()
const { settings, reset } = useSettings()
const savedLabel = ref('')

watch(settings, () => {
  savedLabel.value = language.value === 'ru' ? 'Настройки сохранены в браузере' : 'Settings saved in this browser'
  window.setTimeout(() => { savedLabel.value = '' }, 1800)
}, { deep: true })

const languageOptions = computed(() => [
  { value: 'ru' as const, label: t('russian') },
  { value: 'en' as const, label: t('english') },
])
</script>

<template>
  <div class="flex-1 overflow-y-auto p-6 md:p-10">
    <div class="mx-auto max-w-3xl">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">{{ t('settings') }}</h1>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Интерфейс и локальная модель сохраняются в этом браузере.</p>
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
        <h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Интерфейс</h2>
        <div class="mt-4 grid gap-5 sm:grid-cols-2">
          <label class="text-sm text-gray-700 dark:text-gray-300">Тема
            <select v-model="settings.theme" class="mt-2 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800">
              <option value="dark">Тёмная</option><option value="light">Светлая</option>
            </select>
          </label>
          <label class="text-sm text-gray-700 dark:text-gray-300">Вид файлов по умолчанию
            <select v-model="settings.fileView" class="mt-2 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800">
              <option value="grid">Сетка</option><option value="list">Список</option>
            </select>
          </label>
          <label class="flex items-center justify-between gap-3 text-sm text-gray-700 dark:text-gray-300 sm:col-span-2">
            <span><span class="block font-medium">Сворачивать боковую панель</span><span class="mt-1 block text-xs text-gray-500">Показывать только иконки навигации.</span></span>
            <input v-model="settings.compactSidebar" type="checkbox" class="h-5 w-5 accent-emerald-600">
          </label>
        </div>
      </section>

      <section class="mt-5 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <label for="folder-file-limit" class="text-sm font-semibold text-gray-900 dark:text-gray-100">{{ t('folderLimitSetting') }}</label>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ t('folderLimitSettingDescription') }}</p>
        <select id="folder-file-limit" v-model.number="maxFilesPerFolder" class="mt-4 w-full max-w-xs rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 dark:border-gray-700 dark:bg-gray-800">
          <option :value="100">100</option><option :value="500">500</option><option :value="1000">1,000</option><option :value="2500">2,500</option><option :value="5000">5,000</option>
        </select>
      </section>

      <section class="mt-5 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div class="flex items-start justify-between gap-4"><div><h2 class="text-sm font-semibold text-gray-900 dark:text-gray-100">Локальная ИИ-модель</h2><p class="mt-1 text-xs text-gray-500">Подключение к совместимому с Ollama серверу на вашем компьютере.</p></div><input v-model="settings.localModel.enabled" type="checkbox" class="mt-1 h-5 w-5 accent-emerald-600" aria-label="Включить локальную модель"></div>
        <div class="mt-5 grid gap-4 sm:grid-cols-2" :class="!settings.localModel.enabled && 'opacity-50'">
          <label class="text-sm text-gray-700 dark:text-gray-300">Адрес сервера<input v-model.trim="settings.localModel.endpoint" :disabled="!settings.localModel.enabled" type="url" placeholder="http://127.0.0.1:11434" class="mt-2 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800"></label>
          <label class="text-sm text-gray-700 dark:text-gray-300">Название модели<input v-model.trim="settings.localModel.model" :disabled="!settings.localModel.enabled" placeholder="llama3.2" class="mt-2 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800"></label>
          <label class="text-sm text-gray-700 dark:text-gray-300 sm:col-span-2">Системная инструкция<textarea v-model="settings.localModel.systemPrompt" :disabled="!settings.localModel.enabled" rows="3" class="mt-2 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800" /></label>
        </div>
      </section>

      <button type="button" class="mt-5 rounded-xl border border-gray-200 px-4 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800" @click="reset">Сбросить настройки интерфейса</button>
    </div>
  </div>
</template>
