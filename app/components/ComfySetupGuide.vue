<script setup lang="ts">
const { t, language } = useLanguage()
const error = ref('')
const steps = computed(() => language.value === 'ru' ? [
  'Откройте Comfy Desktop из меню «Пуск». Выберите локальную установку, завершите установку зависимостей и запустите экземпляр ComfyUI. Дождитесь открытия редактора. Используйте адрес и порт именно этого экземпляра из окна сервера или журналов: порт может отличаться от 8188.',
  'Установите модель в ComfyUI. Для встроенного варианта подходит полный checkpoint SD 1.x или SDXL с CLIP и VAE. Откройте стандартный Text to Image workflow и убедитесь в Comfy Desktop, что он создаёт изображение через SaveImage.',
  'В OwlSift включите интеграцию, вставьте базовый адрес сервера, например http://127.0.0.1:8188, и нажмите «Проверить подключение». Не добавляйте /v1, /prompt или /api. Токен сервера нужен только если его требует ваш сервер или прокси.',
  'Если OwlSift работает через Docker / WSL, а Comfy — в Windows, localhost на стороне прокси означает контейнер. Разрешите серверу слушать частную сеть и укажите доступный из контейнера адрес Windows либо host.docker.internal для Docker Desktop. Не публикуйте сервер в интернет. В режиме «Напрямую» адрес должен открываться в браузере, а Comfy должен разрешать CORS для OwlSift.',
  'Для своего workflow сначала добейтесь успешного запуска в Comfy Desktop. Выберите File → Export (API) и загрузите JSON в OwlSift. Обычный JSON редактора с массивом nodes не подходит. Укажите ID узла и имя строкового поля положительного промпта; при необходимости сопоставьте отрицательный промпт и числовой seed. Сохраните в графе узел SaveImage. Остальные параметры остаются как в экспорте.',
  'Откройте ИИ-ассистент → генерацию изображений. Выберите рабочую папку и действие, введите описание. При желании улучшите промпт выбранной текстовой моделью, проверьте его и запустите генерацию. Comfy хранит свой результат, а OwlSift копирует изображения в выбранную папку проекта и добавляет ссылки в чат.',
  'Для полностью локальной работы выберите локальную текстовую модель и оставьте режим локальных узлов включённым. Облачные узлы отмечаются отдельно; для них нужно отключить ограничение и дать согласие перед запуском. Для некоторых Partner Nodes потребуется отдельный ключ Comfy. Пользовательские узлы с неизвестным поведением считаются непроверенными.',
  'Текстовая и графическая модели могут работать одновременно. Если им не хватает общей видеопамяти, уменьшите размер изображения или разгрузите одну из моделей. Генерация медиа не выполняет OCR, распознавание речи или анализ кадров для поиска RAG.',
] : [
  'Launch Comfy Desktop from the Start Menu. Choose a local installation, complete dependency setup and start a ComfyUI instance. Wait for its editor to open. Copy the address and port of that instance from its server window or logs; the port may differ from 8188.',
  'Install an image model in ComfyUI. The built-in option needs a full SD 1.x or SDXL checkpoint with CLIP and VAE. Run the standard Text to Image workflow in Comfy Desktop and confirm that SaveImage produces an image.',
  'Enable this integration in OwlSift, enter the server base URL, such as http://127.0.0.1:8188, and verify the connection. Do not append /v1, /prompt, or /api. A server token is only needed if your server or reverse proxy requires it.',
  'When OwlSift runs in Docker / WSL and Comfy runs on Windows, localhost from the proxy refers to the container. Allow the server to listen on your private network and use a Windows address reachable from the container, or host.docker.internal with Docker Desktop. Do not expose the server to the internet. Direct mode needs a browser-reachable address and CORS permission for OwlSift.',
  'For custom workflows, first run the graph successfully in Comfy Desktop. Use File → Export (API), then import that JSON into OwlSift. The normal editor JSON with a nodes array is not accepted. Map the positive prompt node ID and its literal string input; optionally map negative prompt and numeric seed inputs. Keep a SaveImage output node. Other parameters stay as exported.',
  'Open AI Assistant → image generation. Choose a workspace and an action, then describe the image. Optionally refine the prompt with your selected text model, review it, and generate. Comfy keeps its output; OwlSift copies the images into the selected project folder and adds file links to the chat.',
  'For local operation, use a local text model and keep local-only nodes enabled. Cloud nodes are identified separately and require disabling that restriction and consenting before a run. Some Partner Nodes need a separate Comfy API key. Unknown custom nodes are treated as unverified.',
  'Text and image models can run together. If they compete for GPU memory, lower image resolution or unload one of them. Generating media does not perform OCR, speech transcription or frame analysis for RAG search.',
])
const docs = [
  { title: 'Comfy Desktop', url: 'https://docs.comfy.org/installation/desktop/windows' },
  { title: 'Text to Image', url: 'https://docs.comfy.org/tutorials/basic/text-to-image' },
  { title: 'API workflow export', url: 'https://github.com/Comfy-Org/ComfyUI/blob/master/script_examples/basic_api_example.py' },
  { title: 'Server API', url: 'https://docs.comfy.org/development/comfyui-server/comms_routes' },
  { title: 'Partner / cloud nodes', url: 'https://docs.comfy.org/tutorials/partner-nodes/overview' },
]
const open = async (event: MouseEvent, url: string) => {
  if (!window.electron) return
  event.preventDefault()
  try { error.value = ''; await window.electron.invoke('app:open-external', url) } catch { error.value = t('chatLinkOpenError') }
}
</script>
<template>
  <AppDisclosure :title="t('comfySetup')" class="mt-5">
    <ol class="list-decimal space-y-3 pl-5 text-xs leading-relaxed text-surface-600 dark:text-surface-300"><li v-for="step in steps" :key="step">{{ step }}</li></ol>
    <h3 class="mb-2 mt-5 text-xs font-semibold">{{ t('comfyDocs') }}</h3>
    <ul class="space-y-2"><li v-for="doc in docs" :key="doc.url"><a :href="doc.url" target="_blank" rel="noopener noreferrer" class="text-xs text-primary-700 underline dark:text-primary-400" @click="open($event, doc.url)">{{ doc.title }}</a></li></ul>
    <p v-if="error" role="alert" class="mt-2 text-xs text-rose-500">{{ error }}</p>
  </AppDisclosure>
</template>
