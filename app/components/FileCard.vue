<script setup lang="ts">
import type { LocalFile } from '~/types/file'

const props = defineProps<{
  file: LocalFile
  active?: boolean
}>()
const { t } = useLanguage()

const emit = defineEmits<{
  select: [file: LocalFile]
  summary: [file: LocalFile]
}>()

const icon = computed(() => {
  switch (props.file.extension) {
    case 'pdf':
      return 'lucide:file-text'

    case 'docx':
      return 'lucide:file-type-2'

    case 'md':
      return 'lucide:file-code'

    case 'txt':
      return 'lucide:file-text'

    case 'png':
      return 'lucide:image'

    default:
      return 'lucide:file'
  }
})

const badgeClass = computed(() => {
  switch (props.file.extension) {
    case 'pdf':
      return 'bg-red-500/10 text-red-500'

    case 'docx':
      return 'bg-blue-500/10 text-blue-500'

    case 'md':
      return 'bg-emerald-500/10 text-emerald-500'

    case 'png':
      return 'bg-purple-500/10 text-purple-500'

    default:
      return 'bg-gray-500/10 text-gray-500'
  }
})
</script>

<template>
  <article
      class="group relative cursor-pointer rounded-xl border p-4
           transition-all"
      :class="
      active
        ? 'border-emerald-500/50 bg-emerald-500/5 shadow-sm'
        : 'border-gray-200/80 bg-white hover:border-gray-300 hover:shadow-sm dark:border-gray-800 dark:bg-gray-800/50 dark:hover:border-gray-700'
    "
      @click="emit('select', file)"
  >
    <div class="flex items-start justify-between gap-4">

      <div class="flex min-w-0 flex-1 items-start gap-3.5">

        <!-- File icon -->

        <div
            class="flex h-10 w-10 shrink-0 items-center
                 justify-center rounded-xl text-xs font-bold"
            :class="badgeClass"
        >
          <Icon :name="icon" size="20" />
        </div>

        <!-- Content -->

        <div class="min-w-0 flex-1">

          <div class="flex items-center gap-2">
            <h3
                class="truncate text-sm font-semibold
                     text-gray-900 transition-colors
                     group-hover:text-emerald-500
                     dark:text-gray-100"
            >
              {{ file.name }}
            </h3>

            <span
                v-for="tag in file.tags"
                :key="tag"
                class="rounded-full bg-gray-100 px-2 py-0.5
                     text-[10px] font-medium text-gray-500
                     dark:bg-gray-700 dark:text-gray-400"
            >
              #{{ tag }}
            </span>
          </div>

          <p
              class="mt-0.5 truncate font-mono text-xs text-gray-400"
          >
            {{ file.path }}
          </p>

          <div
              class="mt-2.5 rounded-lg border border-gray-100
                   bg-gray-50 p-2.5 text-xs leading-relaxed
                   text-gray-600 dark:border-gray-800
                   dark:bg-gray-900/60 dark:text-gray-300"
          >
            {{ file.snippet }}
          </div>
        </div>
      </div>

      <!-- Meta -->

      <div
          class="flex shrink-0 flex-col items-end
               justify-between self-stretch"
      >
        <div class="text-right text-[11px] text-gray-400">
          <div>{{ file.size }}</div>
          <div>{{ file.mtime }}</div>
        </div>

        <button
            class="flex items-center gap-1 rounded-lg
                 bg-emerald-500/10 px-2.5 py-1
                 text-[11px] font-medium text-emerald-600
                 transition hover:bg-emerald-500/20
                 dark:text-emerald-400"
            @click.stop="emit('summary', file)"
        >
          <Icon name="lucide:sparkles" size="12" />
          {{ t('aiSummary') }}
        </button>
      </div>

    </div>
  </article>
</template>
