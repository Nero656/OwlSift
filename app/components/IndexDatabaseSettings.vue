<script setup lang="ts">
import type { ScanMode } from '../../src/types/documentScan'

const { language } = useLanguage()
const desktop = ref(false)
const bridge = () => window.electron
const catalog = ref<{ activeId: string; indexes: Array<{ id: string; name: string }>; scanMode: ScanMode }>()
const name = ref('')
const busy = ref(false)
const error = ref('')
const labels = computed(() => language.value === 'ru'
  ? { title: 'Базы индекса', name: 'Название базы', create: 'Создать', active: 'Активная', switch: 'Переключиться', remove: 'Удалить', hint: 'Переключитесь на другую базу, чтобы удалить активную.', storage: 'Режим сканирования', auto: 'Авто (SSD, если тип не определён)', ssd: 'SSD (параллельное чтение)', hdd: 'HDD (последовательное чтение)' }
  : { title: 'Index databases', name: 'Database name', create: 'Create', active: 'Active', switch: 'Switch to index', remove: 'Delete', hint: 'Switch to another index to delete the active one.', storage: 'Scan strategy', auto: 'Auto (SSD when unknown)', ssd: 'SSD (parallel reads)', hdd: 'HDD (sequential reads)' })

async function run(action?: () => Promise<void>, reload = false) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await action?.()
    if (reload) { window.location.reload(); return }
    catalog.value = await bridge().invoke('db:list-indexes')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = false
  }
}

async function create() {
  await run(async () => {
    await bridge().invoke('db:create-index', name.value)
    name.value = ''
  })
}

onMounted(() => {
  desktop.value = Boolean(window.electron)
  if (desktop.value) void run()
})
</script>

<template>
  <section v-if="desktop" class="space-y-4 rounded-xl border border-surface-200 p-4 dark:border-surface-700">
    <h2 class="font-semibold">{{ labels.title }}</h2>
    <p v-if="error" role="alert" class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>
    <template v-if="catalog">
      <ul class="space-y-2">
        <li v-for="index in catalog.indexes" :key="index.id" class="flex flex-wrap items-center gap-2 text-sm">
          <span class="min-w-0 grow break-all">{{ index.name }}</span>
          <span v-if="index.id === catalog.activeId" class="text-primary-600 dark:text-primary-400">{{ labels.active }}</span>
          <template v-else>
            <UButton size="sm" variant="soft" :disabled="busy" @click="run(() => bridge().invoke('db:switch-index', index.id), true)">{{ labels.switch }}</UButton>
            <UButton size="sm" color="error" variant="ghost" :disabled="busy" @click="run(() => bridge().invoke('db:delete-index', { id: index.id, language }))">{{ labels.remove }}</UButton>
          </template>
        </li>
      </ul>
      <p class="text-xs text-surface-500">{{ labels.hint }}</p>
      <form class="flex flex-wrap gap-2" @submit.prevent="create">
        <UInput v-model="name" :placeholder="labels.name" :aria-label="labels.name" maxlength="80" :disabled="busy" />
        <UButton type="submit" :disabled="busy || !name.trim()">{{ labels.create }}</UButton>
      </form>
      <label class="block space-y-2 text-sm">
        <span>{{ labels.storage }}</span>
        <AppDropdown :model-value="catalog.scanMode" :options="(['auto', 'ssd', 'hdd'] as const).map(value => ({ value, label: labels[value] }))" :disabled="busy" class="block w-full max-w-sm" @update:model-value="value => run(() => bridge().invoke('db:set-scan-mode', value as ScanMode))" />
      </label>
    </template>
  </section>
</template>
