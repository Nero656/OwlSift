<script setup lang="ts">
import type { LocalFile } from '~/types/file'

const {
  activeFile
} = useFiles()

const {
  messages,
  isThinking,
  ask,
  clear
} = useAi()
const { t, language } = useLanguage()
const imagePreview = ref<string | null>(null)
let imagePreviewRequest = 0

const rightTab = ref<'chat' | 'summary'>('chat')

const userQuery = ref('')

const samplePrompts = computed(() => [t('promptTerms'), t('promptPrices'), t('promptTakeaways')])

watch(() => activeFile.value?.id, async (fileId) => {
  const request = ++imagePreviewRequest
  imagePreview.value = null
  const extension = activeFile.value?.extension.toLowerCase()
  if (!fileId || !extension || !['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif'].includes(extension)) return

  try {
    const preview = await window.electron.invoke('files:get-image-preview', fileId)
    if (request === imagePreviewRequest) imagePreview.value = preview
  } catch (error) {
    console.warn('Could not load selected image preview:', error)
  }
})

const sendPrompt = async (prompt: string) => {
  userQuery.value = prompt
  await handleSubmit()
}

const handleSubmit = async () => {
  if (
      !userQuery.value.trim() ||
      !activeFile.value ||
      isThinking.value
  ) {
    return
  }

  const query = userQuery.value

  userQuery.value = ''

  await ask(
      activeFile.value,
      query
  )
}

const openSummary = (file: LocalFile) => {
  activeFile.value = file
  rightTab.value = 'summary'
}

const addTag = () => {
  if (!activeFile.value) return

  // Позже можно открыть модальное окно
  // для добавления тега.
  console.log('Add tag')
}
</script>

<template>
  <aside
      class="flex w-96 shrink-0 flex-col
           overflow-hidden border-l border-gray-200
           bg-white/70 backdrop-blur-md
           dark:border-gray-800 dark:bg-gray-900/70"
  >

    <!-- Active file -->

    <div
        v-if="activeFile"
        class="border-b border-gray-200 p-4
             dark:border-gray-800"
    >
      <div
          class="mb-2 flex items-center justify-between"
      >
        <span
            class="flex items-center gap-1 text-[10px]
                 font-bold uppercase tracking-wider
                 text-emerald-500"
        >
          <Icon
              name="lucide:cpu"
              size="12"
          />

          {{ t('localRag') }}
        </span>

        <span
            class="text-[11px] text-gray-400"
        >
          {{ activeFile.extension.toUpperCase() }}
          {{ t('file') }}
        </span>
      </div>

      <h2
          class="truncate text-sm font-bold
               text-gray-900 dark:text-gray-100"
      >
        {{ activeFile.name }}
      </h2>

      <p
          class="mt-0.5 truncate font-mono
               text-xs text-gray-400"
      >
        {{ activeFile.path }}
      </p>

      <img
          v-if="imagePreview"
          :src="imagePreview"
          :alt="activeFile.name"
          class="mt-3 max-h-64 w-full rounded-xl border border-gray-200/70 bg-gray-50 object-contain dark:border-gray-700 dark:bg-gray-950/40"
      />
    </div>

    <!-- No file -->

    <div
        v-else
        class="border-b border-gray-200 p-6
             text-center dark:border-gray-800"
    >
      <Icon
          name="lucide:mouse-pointer-click"
          size="32"
          class="mx-auto mb-2 text-gray-400"
      />

      <p class="text-xs text-gray-500">
        {{ t('selectFile') }}
      </p>
    </div>

    <!-- Tabs -->

    <div
        class="flex border-b border-gray-200
             text-xs font-medium
             dark:border-gray-800"
    >
      <button
          type="button"
          class="flex-1 border-b-2 py-2.5
               text-center transition-colors"
          :class="
          rightTab === 'chat'
            ? 'border-emerald-500 font-semibold text-emerald-600 dark:text-emerald-400'
            : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
        "
          @click="rightTab = 'chat'"
      >
        {{ t('aiAssistant') }}
      </button>

      <button
          type="button"
          class="flex-1 border-b-2 py-2.5
               text-center transition-colors"
          :class="
          rightTab === 'summary'
            ? 'border-emerald-500 font-semibold text-emerald-600 dark:text-emerald-400'
            : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
        "
          @click="rightTab = 'summary'"
      >
        {{ t('summaryNotes') }}
      </button>
    </div>

    <!-- CHAT -->

    <div
        v-if="rightTab === 'chat'"
        class="flex min-h-0 flex-1 flex-col"
    >

      <!-- Messages -->

      <div
          class="flex-1 space-y-3 overflow-y-auto p-4"
      >

        <!-- Suggested prompts -->

        <div
            v-if="messages.length === 0"
            class="space-y-2"
        >
          <p
              class="text-[11px] font-semibold
                   uppercase tracking-wider
                   text-gray-400"
          >
            {{ t('suggestedActions') }}
          </p>

          <button
              v-for="prompt in samplePrompts"
              :key="prompt"
              type="button"
              class="group flex w-full items-center
                   justify-between rounded-xl border
                   border-gray-200 bg-gray-50 p-2.5
                   text-left text-xs text-gray-700
                   transition-all
                   hover:border-emerald-500/50
                   hover:text-emerald-500
                   dark:border-gray-800
                   dark:bg-gray-800/40
                   dark:text-gray-300"
              :disabled="!activeFile"
              @click="sendPrompt(prompt)"
          >
            <span>
              {{ prompt }}
            </span>

            <Icon
                name="lucide:arrow-up-right"
                size="14"
                class="opacity-0 transition-opacity
                     group-hover:opacity-100"
            />
          </button>
        </div>

        <!-- Messages -->

        <div
            v-for="(message, index) in messages"
            :key="index"
            class="max-w-[90%] rounded-xl p-3
                 text-xs leading-relaxed"
            :class="
            message.sender === 'user'
              ? 'ml-auto rounded-br-none bg-emerald-600 font-medium text-white'
              : 'mr-auto rounded-bl-none border border-gray-200/50 bg-gray-100 text-gray-800 dark:border-gray-700/50 dark:bg-gray-800 dark:text-gray-200'
          "
        >
          <div
              v-if="message.sender === 'ai'"
              class="mb-1 flex items-center gap-1.5
                   text-[10px] font-bold text-emerald-500"
          >
            <Icon
                name="lucide:bot"
                size="12"
            />

            {{ language === 'ru' ? 'Локальная языковая модель (Ollama)' : 'Local LLM (Ollama)' }}
          </div>

          <p class="whitespace-pre-line">
            {{ message.text }}
          </p>
        </div>

        <!-- Thinking -->

        <div
            v-if="isThinking"
            class="mr-auto flex items-center gap-2
                 rounded-xl rounded-bl-none
                 bg-gray-100 p-3 text-xs
                 text-gray-500
                 dark:bg-gray-800"
        >
          <Icon
              name="lucide:loader-2"
              size="16"
              class="animate-spin text-emerald-500"
          />

          <span>
            {{ t('analyzing') }}
          </span>
        </div>

      </div>

      <!-- Input -->

      <div
          class="border-t border-gray-200 bg-white
               p-3 dark:border-gray-800
               dark:bg-gray-900"
      >
        <form
            class="relative"
            @submit.prevent="handleSubmit"
        >
          <input
              v-model="userQuery"
              type="text"
              :placeholder="
              activeFile
                ? t('askFile')
                : t('selectFileToAsk')
            "
              :disabled="
              !activeFile ||
              isThinking
            "
              class="w-full rounded-xl border
                   border-transparent
                   bg-gray-100 py-2.5 pl-3 pr-10
                   text-xs outline-none
                   transition
                   focus:border-emerald-500
                   disabled:opacity-50
                   dark:bg-gray-800"
          />

          <button
              type="submit"
              :disabled="
              !userQuery.trim() ||
              !activeFile ||
              isThinking
            "
              class="absolute right-2 top-1/2
                   -translate-y-1/2 rounded-lg
                   bg-emerald-500 p-1.5
                   text-white transition
                   hover:bg-emerald-600
                   disabled:opacity-40"
          >
            <Icon
                name="lucide:send"
                size="14"
            />
          </button>
        </form>
      </div>
    </div>

    <!-- SUMMARY -->

    <div
        v-else
        class="flex-1 space-y-4 overflow-y-auto p-4"
    >

      <template v-if="activeFile">

        <!-- Summary -->

        <section>
          <h4
              class="mb-2 text-xs font-bold
                   uppercase text-gray-400"
          >
            {{ t('executiveSummary') }}
          </h4>

          <div
              class="rounded-xl border border-gray-200
                   bg-gray-50 p-3 text-xs
                   leading-relaxed text-gray-700
                   dark:border-gray-800
                   dark:bg-gray-800/50
                   dark:text-gray-300"
          >
            {{
              activeFile.summary ||
              t('generateSummary')
            }}
          </div>
        </section>

        <!-- Note -->

        <section>
          <h4
              class="mb-2 mt-4 text-xs font-bold
                   uppercase text-gray-400"
          >
            {{ t('attachedNote') }}
          </h4>

          <textarea
              v-model="activeFile.note"
              :placeholder="t('addNote')"
              class="h-28 w-full resize-none rounded-xl
                   border border-gray-200
                   bg-gray-100 p-3 text-xs
                   outline-none transition
                   focus:ring-2
                   focus:ring-emerald-500
                   dark:border-gray-700
                   dark:bg-gray-800"
          />
        </section>

        <!-- Tags -->

        <section>
          <h4
              class="mb-2 mt-4 text-xs font-bold
                   uppercase text-gray-400"
          >
            {{ t('fileTags') }}
          </h4>

          <div class="flex flex-wrap gap-1.5">

            <span
                v-for="tag in activeFile.tags"
                :key="tag"
                class="rounded-lg bg-gray-200
                     px-2.5 py-1 text-xs
                     text-gray-700
                     dark:bg-gray-800
                     dark:text-gray-300"
            >
              #{{ tag }}
            </span>

            <button
                type="button"
                class="rounded-lg border
                     border-dashed border-gray-300
                     px-2.5 py-1 text-xs
                     text-gray-400 transition
                     hover:text-gray-600
                     dark:border-gray-700
                     dark:hover:text-gray-200"
                @click="addTag"
            >
              + {{ t('addTag') }}
            </button>

          </div>
        </section>

      </template>

      <div
          v-else
          class="py-8 text-center text-xs
               text-gray-400"
      >
        {{ t('noActiveFile') }}
      </div>

    </div>
  </aside>
</template>
