<script setup lang="ts">
defineProps<{ provider: 'local' | 'global'; localProvider?: 'lmstudio' | 'ollama' }>()
const { settings } = useSettings()
const { language } = useLanguage()
const error = ref('')
const remoteEndpoint = computed(() => settings.value.globalModel.endpoint || ({
  openai: 'https://api.openai.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  deepseek: 'https://api.deepseek.com',
}[settings.value.globalModel.provider]))
const remoteProviderName = computed(() => ({ openai: 'OpenAI', gemini: 'Gemini', deepseek: 'DeepSeek' }[settings.value.globalModel.provider]))
const text = computed(() => language.value === 'ru' ? {
  title: 'Как подключить ИИ-модель',
  local: 'LM Studio на вашем компьютере',
  ollama: 'Ollama на вашем компьютере',
  ollamaSteps: ['Установите Ollama для Windows, macOS или Linux с официального сайта и запустите приложение/службу.', 'Скачайте модель в терминале, например: ollama pull llama3.2. Команда ollama list показывает установленные модели.', 'В настройках OwlSift выберите локальную модель → Ollama. Адрес по умолчанию — http://localhost:11434.', 'Нажмите «Подключиться к Ollama» и выберите модель из списка. Убедитесь, что модель уже скачана; затем отправьте вопрос в ИИ-ассистенте.'],
  ollamaCors: 'Браузерное подключение требует, чтобы Ollama разрешала origin приложения. Укажите адрес приложения в OLLAMA_ORIGINS и перезапустите Ollama; для локальной разработки можно использовать http://localhost:3000. Не разрешайте посторонние origins в публичной сети.',
  ollamaNetwork: 'Если OwlSift открыт в Docker/WSL или на другом устройстве, localhost указывает на это окружение, а не на Windows. В Ollama задайте OLLAMA_HOST=0.0.0.0:11434, разрешите порт 11434 в брандмауэре только для доверенной частной сети и используйте IP компьютера с Ollama. Для CORS также добавьте origin OwlSift в OLLAMA_ORIGINS.',
  localSteps: [
    'В LM Studio скачайте модель и откройте вкладку Developer. Загрузите модель и запустите сервер кнопкой Start Server.',
    'В приложении выберите «Локальная модель (LM Studio)» и включите локальную модель.',
    'Укажите адрес сервера, затем нажмите «Подключиться к LM Studio».',
    'После подключения выберите модель из выпадающего списка и отправьте короткий вопрос в ИИ-ассистенте.',
  ],
  endpoint: 'Пример адреса API',
  ollamaTroubleshoot: [['Connection refused', 'Проверьте, что Ollama запущена и отвечает на http://localhost:11434/api/tags. При необходимости перезапустите приложение Ollama.'], ['Model not found', 'Выполните ollama pull <имя-модели>, затем повторите подключение и выберите точное имя из списка.'], ['CORS / Failed to fetch', 'Добавьте origin OwlSift в OLLAMA_ORIGINS и перезапустите Ollama. Браузерный запрос не может обойти CORS.'], ['Docker / WSL', 'localhost внутри контейнера — это контейнер. Используйте доступный IP хоста и настройте OLLAMA_HOST, OLLAMA_ORIGINS и firewall.']],
  browser: 'Для прямого подключения из браузера включите Enable CORS в Server Settings LM Studio.',
  authentication: 'Если в LM Studio включено Require Authentication, используйте в приложении провайдер «Глобальная модель», адрес LM Studio и его API-токен: у локального режима пока нет поля токена.',
  networkTitle: 'LM Studio в Windows, приложение в Docker / WSL',
  network: 'В LM Studio включите Serve on Local Network. Используйте IP Windows и порт сервера: такой адрес доступен и браузеру, и контейнеру. Разрешите порт в брандмауэре Windows для частной сети. localhost внутри контейнера указывает на контейнер.',
  docker: 'host.docker.internal подходит для обращений из Docker Desktop, но может не разрешаться в браузере. Для общего адреса браузера и контейнера используйте IP Windows.',
  global: 'Глобальный OpenAI-совместимый API',
  globalSteps: [
    'Создайте API-ключ в кабинете OpenAI, Google AI Studio или DeepSeek Platform.',
    'Выберите «Глобальная модель», затем провайдера OpenAI, Gemini или DeepSeek. Адрес API можно оставить автоматически заполненным.',
    'Используйте API-ключ, созданный именно для выбранного провайдера.',
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
  links: { ollamaDocs: 'Ollama: установка и загрузка моделей', ollamaModels: 'Ollama: API списка моделей', ollamaApi: 'Ollama: OpenAI-совместимый API', ollamaFaq: 'Ollama: настройка, CORS и сеть', lmServer: 'LM Studio: настройки сервера и CORS', lmCompat: 'LM Studio: OpenAI-совместимый API', openaiStart: 'OpenAI: начало работы', openaiKeys: 'OpenAI: управление API-ключами', openaiErrors: 'OpenAI: коды ошибок', geminiApi: 'Gemini: OpenAI-совместимый API', deepseekApi: 'DeepSeek: API и модели' },
  openError: 'Не удалось открыть системный браузер. Скопируйте адрес ссылки и откройте его вручную.',
} : {
  title: 'How to connect an AI model',
  local: 'LM Studio on your computer',
  ollama: 'Ollama on your computer',
  ollamaSteps: ['Install Ollama for Windows, macOS, or Linux from the official site and start the app/service.', 'Download a model in a terminal, for example: ollama pull llama3.2. Run ollama list to see installed models.', 'In OwlSift Settings, select Local model → Ollama. The default address is http://localhost:11434.', 'Click Connect to Ollama and choose an installed model. Then send a question in the AI assistant.'],
  ollamaCors: 'Browser connections require Ollama to allow the app origin. Add the OwlSift origin to OLLAMA_ORIGINS and restart Ollama. For local development, this may be http://localhost:3000. Avoid allowing untrusted origins on a public network.',
  ollamaNetwork: 'When OwlSift runs in Docker/WSL or another device, localhost points to that environment, not Windows. Set OLLAMA_HOST=0.0.0.0:11434, allow port 11434 through the firewall only on a trusted private network, and use the Ollama computer IP. Also add the OwlSift origin to OLLAMA_ORIGINS.',
  localSteps: [
    'Download a model in LM Studio and open the Developer tab. Load the model and click Start Server.',
    'Select “Local model (LM Studio)” in this app and enable the local model.',
    'Enter the server address, then click “Connect to LM Studio”.',
    'Choose a model from the dropdown after connecting and send a short question in the AI assistant.',
  ],
  endpoint: 'Example API address',
  ollamaTroubleshoot: [['Connection refused', 'Confirm Ollama is running and responds at http://localhost:11434/api/tags. Restart the Ollama app if needed.'], ['Model not found', 'Run ollama pull <model-name>, then reconnect and choose the exact model name from the list.'], ['CORS / Failed to fetch', 'Add the OwlSift origin to OLLAMA_ORIGINS and restart Ollama. Browser requests cannot bypass CORS.'], ['Docker / WSL', 'localhost inside a container refers to the container. Use a reachable host IP and configure OLLAMA_HOST, OLLAMA_ORIGINS, and the firewall.']],
  browser: 'For direct browser access, enable Enable CORS in LM Studio Server Settings.',
  authentication: 'If Require Authentication is enabled in LM Studio, use the Global model provider with the LM Studio address and API token. Local mode does not currently have a token field.',
  networkTitle: 'LM Studio on Windows, app in Docker / WSL',
  network: 'Enable Serve on Local Network in LM Studio. Use the Windows IP and server port so both the browser and container can access it. Allow the port through Windows Firewall for private networks. localhost inside a container refers to that container.',
  docker: 'host.docker.internal works for Docker Desktop requests but may not resolve in the browser. Use the Windows IP for an address shared by the browser and container.',
  global: 'Global OpenAI-compatible API',
  globalSteps: [
    'Create an API key in OpenAI, Google AI Studio, or the DeepSeek Platform.',
    'Select Global model, then choose OpenAI, Gemini, or DeepSeek. The API address is filled in automatically.',
    'Use an API key issued by the provider you selected.',
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
  links: { ollamaDocs: 'Ollama: download and install', ollamaModels: 'Ollama: list models API', ollamaApi: 'Ollama: OpenAI-compatible API', ollamaFaq: 'Ollama: configuration, CORS, and networking', lmServer: 'LM Studio: server settings and CORS', lmCompat: 'LM Studio: OpenAI-compatible API', openaiStart: 'OpenAI: quickstart', openaiKeys: 'OpenAI: API key management', openaiErrors: 'OpenAI: error codes', geminiApi: 'Gemini: OpenAI-compatible API', deepseekApi: 'DeepSeek: API and models' },
  openError: 'Could not open the system browser. Copy the link address and open it manually.',
})
const links = {
  ollamaDocs: 'https://ollama.com/download',
  ollamaModels: 'https://docs.ollama.com/api/tags',
  ollamaApi: 'https://docs.ollama.com/api/openai-compatibility',
  ollamaFaq: 'https://docs.ollama.com/faq',
  lmServer: 'https://lmstudio.ai/docs/developer/core/server/settings',
  lmCompat: 'https://lmstudio.ai/docs/developer/openai-compat',
  openaiStart: 'https://developers.openai.com/api/docs/quickstart',
  openaiKeys: 'https://platform.openai.com/api-keys',
  openaiErrors: 'https://developers.openai.com/api/docs/guides/error-codes',
  geminiApi: 'https://ai.google.dev/gemini-api/docs/openai',
  deepseekApi: 'https://api-docs.deepseek.com/guides/codex',
} as const
const openDoc = async (event: MouseEvent, id: keyof typeof links) => {
  if (!window.electron) return
  event.preventDefault()
  try { error.value = ''; await window.electron.invoke('app:open-ai-doc', id) }
  catch { error.value = text.value.openError }
}
</script>

<template>
  <AppDisclosure :title="text.title" class="mt-5">
    <div class="space-y-5 text-surface-600 dark:text-surface-300">
      <section v-if="provider === 'local' && localProvider === 'ollama'" class="space-y-3">
        <h3 class="font-semibold text-surface-900 dark:text-surface-100">{{ text.ollama }}</h3>
        <ol class="list-decimal space-y-2 pl-5"><li v-for="step in text.ollamaSteps" :key="step">{{ step }}</li></ol>
        <p class="text-xs">{{ text.endpoint }}</p>
        <code class="block overflow-x-auto rounded-lg bg-white p-3 text-xs dark:bg-surface-900">http://localhost:11434</code>
        <p>{{ text.ollamaCors }}</p><p>{{ text.ollamaNetwork }}</p>
        <h4 class="font-semibold">{{ text.troubleshooting }}</h4>
        <dl class="space-y-3"><div v-for="[code, hint] in text.ollamaTroubleshoot" :key="code"><dt class="font-mono text-xs font-semibold">{{ code }}</dt><dd class="mt-1 text-xs leading-relaxed">{{ hint }}</dd></div></dl>
      </section>
      <section v-else-if="provider === 'local'" class="space-y-3">
        <h3 class="font-semibold text-surface-900 dark:text-surface-100">{{ text.local }}</h3>
        <ol class="list-decimal space-y-2 pl-5"><li v-for="step in text.localSteps" :key="step">{{ step }}</li></ol>
        <p class="text-xs">{{ text.endpoint }}</p>
        <code class="block overflow-x-auto rounded-lg bg-white p-3 text-xs dark:bg-surface-900">http://127.0.0.1:1234/v1</code>
        <p>{{ text.browser }}</p><p>{{ text.authentication }}</p>
        <h4 class="font-semibold">{{ text.networkTitle }}</h4>
        <p>{{ text.network }}</p>
        <code class="block overflow-x-auto rounded-lg bg-white p-3 text-xs dark:bg-surface-900">http://&lt;Windows IP&gt;:1234/v1</code>
        <p>{{ text.docker }}</p>
      </section>
      <section v-else class="space-y-3">
        <h3 class="font-semibold text-surface-900 dark:text-surface-100">{{ text.global }}</h3>
        <ol class="list-decimal space-y-2 pl-5"><li v-for="step in text.globalSteps" :key="step">{{ step }}</li></ol>
        <p class="text-xs">{{ text.endpoint }} — {{ remoteProviderName }}</p>
        <code class="block overflow-x-auto rounded-lg bg-white p-3 text-xs dark:bg-surface-900">{{ remoteEndpoint }}</code>
        <p>{{ text.compatibility }}</p>
        <p class="text-xs">{{ text.privacy }}</p>
      </section>
      <section>
        <h3 class="mb-2 font-semibold text-surface-900 dark:text-surface-100">{{ text.troubleshooting }}</h3>
        <dl class="space-y-3"><div v-for="[code, hint] in text.errors" :key="code"><dt class="font-mono text-xs font-semibold">{{ code }}</dt><dd class="mt-1 text-xs leading-relaxed">{{ hint }}</dd></div></dl>
      </section>
      <nav :aria-label="text.docs">
        <h3 class="mb-2 font-semibold text-surface-900 dark:text-surface-100">{{ text.docs }}</h3>
        <ul class="space-y-2">
          <li v-for="(url, id) in links" :key="id">
            <a :href="url" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-xs text-primary-700 underline underline-offset-2 dark:text-primary-400" @click="openDoc($event, id)">{{ text.links[id] }}<Icon name="lucide:external-link" size="12" /></a>
          </li>
        </ul>
        <p v-if="error" class="mt-2 text-xs text-rose-500" role="alert">{{ error }}</p>
      </nav>
    </div>
  </AppDisclosure>
</template>
