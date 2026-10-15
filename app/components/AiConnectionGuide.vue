<script setup lang="ts">
defineProps<{ provider: 'local' | 'global' }>()
const { language } = useLanguage()
const error = ref('')
const text = computed(() => language.value === 'ru' ? {
  title: 'Как подключить ИИ-модель',
  local: 'LM Studio на вашем компьютере',
  localSteps: [
    'В LM Studio скачайте модель и откройте вкладку Developer. Загрузите модель и запустите сервер кнопкой Start Server.',
    'В приложении выберите «Локальная модель (LM Studio)» и включите локальную модель.',
    'Укажите адрес сервера, затем нажмите «Подключиться к LM Studio».',
    'После подключения выберите модель из выпадающего списка и отправьте короткий вопрос в ИИ-ассистенте.',
  ],
  endpoint: 'Пример адреса API',
  browser: 'Для прямого подключения из браузера включите Enable CORS в Server Settings LM Studio.',
  authentication: 'Если в LM Studio включено Require Authentication, используйте в приложении провайдер «Глобальная модель», адрес LM Studio и его API-токен: у локального режима пока нет поля токена.',
  networkTitle: 'LM Studio в Windows, приложение в Docker / WSL',
  network: 'В LM Studio включите Serve on Local Network. Используйте IP Windows и порт сервера: такой адрес доступен и браузеру, и контейнеру. Разрешите порт в брандмауэре Windows для частной сети. localhost внутри контейнера указывает на контейнер.',
  docker: 'host.docker.internal подходит для обращений из Docker Desktop, но может не разрешаться в браузере. Для общего адреса браузера и контейнера используйте IP Windows.',
  global: 'Глобальный OpenAI-совместимый API',
  globalSteps: [
    'В кабинете провайдера создайте API-ключ и найдите базовый адрес OpenAI-совместимого API.',
    'Выберите «Глобальная модель» и укажите адрес API без /models и /chat/completions в конце.',
    'Вставьте API-ключ того же провайдера. Ключ от другого сервиса не подходит для api.openai.com.',
    'Нажмите «Проверить подключение», выберите модель из списка, затем откройте ИИ-ассистент и задайте вопрос.',
  ],
  compatibility: 'Для этой интеграции провайдер должен поддерживать список моделей /models и чат /chat/completions. Адрес и API-ключ берите из документации выбранного провайдера.',
  privacy: 'Ключ сохраняется в этом браузере. При использовании глобальной модели запрос и контекст прикреплённых документов передаются выбранному провайдеру.',
  troubleshooting: 'Если не получается подключиться',
  errors: [
    ['401 / invalid_api_key', 'Сервер отклонил ключ. Проверьте соответствие ключа провайдеру, его действительность и повторите проверку подключения.'],
    ['403', 'Проверьте права ключа и доступность выбранной модели.'],
    ['429 / insufficient_quota', 'Прочитайте сообщение провайдера: возможен лимит частоты запросов или исчерпание квоты / баланса.'],
    ['CORS / Failed to fetch', 'Проверьте адрес и доступность сервера. Для браузера API должен разрешать запросы с адреса приложения; в LM Studio включите Enable CORS.'],
    ['Empty response', 'Попробуйте другую модель или проверьте лимит генерации на сервере. PDF-сканы без текстового слоя требуют OCR.'],
  ],
  docs: 'Официальная документация',
  links: { lmServer: 'LM Studio: настройки сервера и CORS', lmCompat: 'LM Studio: OpenAI-совместимый API', openaiStart: 'OpenAI: начало работы', openaiKeys: 'OpenAI: управление API-ключами', openaiErrors: 'OpenAI: коды ошибок' },
  openError: 'Не удалось открыть системный браузер. Скопируйте адрес ссылки и откройте его вручную.',
} : {
  title: 'How to connect an AI model',
  local: 'LM Studio on your computer',
  localSteps: [
    'Download a model in LM Studio and open the Developer tab. Load the model and click Start Server.',
    'Select “Local model (LM Studio)” in this app and enable the local model.',
    'Enter the server address, then click “Connect to LM Studio”.',
    'Choose a model from the dropdown after connecting and send a short question in the AI assistant.',
  ],
  endpoint: 'Example API address',
  browser: 'For direct browser access, enable Enable CORS in LM Studio Server Settings.',
  authentication: 'If Require Authentication is enabled in LM Studio, use the Global model provider with the LM Studio address and API token. Local mode does not currently have a token field.',
  networkTitle: 'LM Studio on Windows, app in Docker / WSL',
  network: 'Enable Serve on Local Network in LM Studio. Use the Windows IP and server port so both the browser and container can access it. Allow the port through Windows Firewall for private networks. localhost inside a container refers to that container.',
  docker: 'host.docker.internal works for Docker Desktop requests but may not resolve in the browser. Use the Windows IP for an address shared by the browser and container.',
  global: 'Global OpenAI-compatible API',
  globalSteps: [
    'Create an API key in your provider account and find its OpenAI-compatible API base URL.',
    'Select Global model and enter the API base URL, without /models or /chat/completions at the end.',
    'Paste an API key issued by the same provider. A key from another service will not work with api.openai.com.',
    'Click Test connection, choose a model from the list, then open the AI assistant and ask a question.',
  ],
  compatibility: 'This integration needs a /models endpoint and a /chat/completions endpoint. Get the base URL and API key from your selected provider’s documentation.',
  privacy: 'The key is stored in this browser. With a global model, prompts and attached document context are sent to the selected provider.',
  troubleshooting: 'Troubleshooting',
  errors: [
    ['401 / invalid_api_key', 'The server rejected the key. Verify that it belongs to the endpoint provider and is still valid, then test again.'],
    ['403', 'Check key permissions and model availability.'],
    ['429 / insufficient_quota', 'Read the provider message: this can indicate rate limits or exhausted quota / credits.'],
    ['CORS / Failed to fetch', 'Check the server URL and availability. Browser requests require CORS permission for the app origin; enable Enable CORS in LM Studio.'],
    ['Empty response', 'Try another model or check the server generation limit. Scanned PDFs without a text layer require OCR.'],
  ],
  docs: 'Official documentation',
  links: { lmServer: 'LM Studio: server settings and CORS', lmCompat: 'LM Studio: OpenAI-compatible API', openaiStart: 'OpenAI: quickstart', openaiKeys: 'OpenAI: API key management', openaiErrors: 'OpenAI: error codes' },
  openError: 'Could not open the system browser. Copy the link address and open it manually.',
})
const links = {
  lmServer: 'https://lmstudio.ai/docs/developer/core/server/settings',
  lmCompat: 'https://lmstudio.ai/docs/developer/openai-compat',
  openaiStart: 'https://developers.openai.com/api/docs/quickstart',
  openaiKeys: 'https://platform.openai.com/api-keys',
  openaiErrors: 'https://developers.openai.com/api/docs/guides/error-codes',
} as const
const openDoc = async (event: MouseEvent, id: keyof typeof links) => {
  if (!window.electron) return
  event.preventDefault()
  try { error.value = ''; await window.electron.invoke('app:open-ai-doc', id) }
  catch { error.value = text.value.openError }
}
</script>

<template>
  <details open class="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-700 dark:bg-gray-800/40">
    <summary class="cursor-pointer font-semibold">{{ text.title }}</summary>
    <div class="mt-4 space-y-5 text-gray-600 dark:text-gray-300">
      <section v-if="provider === 'local'" class="space-y-3">
        <h3 class="font-semibold text-gray-900 dark:text-gray-100">{{ text.local }}</h3>
        <ol class="list-decimal space-y-2 pl-5"><li v-for="step in text.localSteps" :key="step">{{ step }}</li></ol>
        <p class="text-xs">{{ text.endpoint }}</p>
        <code class="block overflow-x-auto rounded-lg bg-white p-3 text-xs dark:bg-gray-900">http://127.0.0.1:1234/v1</code>
        <p>{{ text.browser }}</p><p>{{ text.authentication }}</p>
        <h4 class="font-semibold">{{ text.networkTitle }}</h4>
        <p>{{ text.network }}</p>
        <code class="block overflow-x-auto rounded-lg bg-white p-3 text-xs dark:bg-gray-900">http://&lt;Windows IP&gt;:1234/v1</code>
        <p>{{ text.docker }}</p>
      </section>
      <section v-else class="space-y-3">
        <h3 class="font-semibold text-gray-900 dark:text-gray-100">{{ text.global }}</h3>
        <ol class="list-decimal space-y-2 pl-5"><li v-for="step in text.globalSteps" :key="step">{{ step }}</li></ol>
        <p class="text-xs">{{ text.endpoint }} — OpenAI</p>
        <code class="block overflow-x-auto rounded-lg bg-white p-3 text-xs dark:bg-gray-900">https://api.openai.com/v1</code>
        <p>{{ text.compatibility }}</p>
        <p class="text-xs">{{ text.privacy }}</p>
      </section>
      <section>
        <h3 class="mb-2 font-semibold text-gray-900 dark:text-gray-100">{{ text.troubleshooting }}</h3>
        <dl class="space-y-3"><div v-for="[code, hint] in text.errors" :key="code"><dt class="font-mono text-xs font-semibold">{{ code }}</dt><dd class="mt-1 text-xs leading-relaxed">{{ hint }}</dd></div></dl>
      </section>
      <nav :aria-label="text.docs">
        <h3 class="mb-2 font-semibold text-gray-900 dark:text-gray-100">{{ text.docs }}</h3>
        <ul class="space-y-2">
          <li v-for="(url, id) in links" :key="id">
            <a :href="url" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-xs text-emerald-700 underline underline-offset-2 dark:text-emerald-400" @click="openDoc($event, id)">{{ text.links[id] }}<Icon name="lucide:external-link" size="12" /></a>
          </li>
        </ul>
        <p v-if="error" class="mt-2 text-xs text-rose-500" role="alert">{{ error }}</p>
      </nav>
    </div>
  </details>
</template>
