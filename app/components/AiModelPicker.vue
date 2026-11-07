<script setup lang="ts">
import { enabledRequestProviders, type ProviderConnection, type RequestProvider } from '../../src/services/localProviders'

const props = defineProps<{
  provider: RequestProvider
  model: string
  connections: Record<RequestProvider, ProviderConnection>
  connect: (provider: RequestProvider) => Promise<unknown>
  disabled?: boolean
}>()
const emit = defineEmits<{ select: [provider: RequestProvider, model: string] }>()
const { settings } = useSettings()
const { t } = useLanguage()
const open = ref(false)
const search = ref('')
const collapsed = ref<Record<RequestProvider, boolean>>({ ollama: false, lmstudio: false, global: false })
const providers = computed(() => enabledRequestProviders(settings.value))
const providerLabel = (id: RequestProvider) => id === 'ollama' ? 'Ollama' : id === 'lmstudio' ? 'LM Studio (bionic)' : t('globalModelOption')
const config = (id: RequestProvider) => id === 'global' ? settings.value.globalModel : settings.value.localModels[id]
const configured = (id: RequestProvider) => Boolean(config(id).endpoint.trim()) && config(id).enabled
const groups = computed(() => providers.value.map(id => {
  const query = search.value.trim().toLocaleLowerCase()
  const models = [...new Set(props.connections[id].models)]
  return { id, label: providerLabel(id), models: models.filter(model => !query || `${providerLabel(id)} ${model}`.toLocaleLowerCase().includes(query)) }
}))
const checking = computed(() => providers.value.some(id => props.connections[id].checking))
const hasMatches = computed(() => groups.value.some(group => group.models.length))
const refresh = async (force = false) => {
  await Promise.allSettled(providers.value.filter(id => configured(id) && !props.connections[id].checking && (force || props.connections[id].status === 'idle')).map(id => props.connect(id)))
}
onMounted(() => {
  if (configured(props.provider) && props.connections[props.provider].status === 'idle') void props.connect(props.provider).catch(() => {})
})
watch(open, value => {
  if (value) { search.value = ''; void refresh() }
})
watch(() => props.disabled, value => { if (value) open.value = false })
const select = (provider: RequestProvider, model: string) => {
  if (props.disabled || !configured(provider)) return
  emit('select', provider, model)
  open.value = false
}
const navigate = (event: KeyboardEvent) => {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  if (event.target instanceof HTMLInputElement && event.key !== 'ArrowDown') return
  const buttons = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button[data-model-option]:not(:disabled)')]
  if (!buttons.length) return
  event.preventDefault()
  const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length
  buttons[index]?.focus()
}
</script>

<template>
  <UPopover v-model:open="open" :content="{ align: 'end', side: 'top', sideOffset: 10, collisionPadding: 12 }" :ui="{ content: 'z-[150] w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-xl' }">
    <UButton color="neutral" variant="ghost" size="sm" class="max-w-56 min-w-0 gap-1.5 rounded-xl px-2" :disabled="disabled" :aria-label="t('chatModel')" :title="`${providerLabel(provider)} · ${config(provider).enabled ? model || t('selectModel') : t('noEnabledProviders')}`">
      <Icon :name="provider === 'global' ? 'lucide:cloud' : 'lucide:cpu'" size="15" class="shrink-0 text-primary-500" />
      <span class="min-w-0 truncate text-xs">{{ config(provider).enabled ? model || t('selectModel') : t('noEnabledProviders') }}</span>
      <Icon name="lucide:chevron-down" size="13" class="shrink-0 text-surface-500 transition-transform" :class="{ 'rotate-180': open }" />
    </UButton>
    <template #content>
      <div @keydown="navigate">
        <div class="space-y-2 border-b border-surface-200 p-3 dark:border-surface-800">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-semibold text-surface-500">{{ t('chatModel') }}</span>
            <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="xs" :loading="checking" :disabled="checking || disabled || !providers.length" :aria-label="t('refreshModels')" :title="t('refreshModels')" @click="refresh(true)" />
          </div>
          <UInput v-model="search" autofocus icon="i-lucide-search" :placeholder="t('filterModels')" :aria-label="t('filterModels')" class="w-full" />
        </div>
        <div class="max-h-[min(23rem,55vh)] overflow-y-auto p-1.5 [scrollbar-width:thin]" :aria-busy="checking">
          <section v-for="group in groups" v-show="!search.trim() || group.models.length" :key="group.id" :aria-label="group.label" class="mb-1 last:mb-0">
            <button type="button" class="flex w-full items-center gap-2 rounded-md bg-surface-100 px-2.5 py-2 text-left text-xs font-semibold text-surface-700 transition hover:bg-surface-200 dark:bg-surface-800/70 dark:text-surface-200 dark:hover:bg-surface-800" :aria-expanded="group.models.length > 0 && (Boolean(search.trim()) || !collapsed[group.id])" :aria-controls="`chat-models-${group.id}`" @click="collapsed[group.id] = !collapsed[group.id]">
              <Icon :name="group.id === 'global' ? 'lucide:cloud' : 'lucide:cpu'" size="14" class="text-surface-500" />
              <span class="flex-1">{{ group.label }}</span>
              <span class="text-[10px] font-normal tabular-nums text-surface-500">{{ group.models.length }}</span>
              <Icon name="lucide:chevron-down" size="13" class="transition-transform" :class="{ 'rotate-180': group.models.length > 0 && (search.trim() || !collapsed[group.id]) }" />
            </button>
            <div v-show="group.models.length > 0 && (search.trim() || !collapsed[group.id])" :id="`chat-models-${group.id}`" class="my-1 ml-3 border-l border-surface-200 pl-1.5 dark:border-surface-700">
              <button v-for="name in group.models" :key="name" type="button" data-model-option class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition hover:bg-surface-100 focus-visible:outline-2 focus-visible:outline-primary-500 disabled:opacity-40 dark:hover:bg-surface-800" :class="provider === group.id && model === name ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400' : 'text-surface-600 dark:text-surface-300'" :disabled="disabled || !configured(group.id)" :aria-pressed="provider === group.id && model === name" :title="name" @click="select(group.id, name)">
                <Icon :name="group.id === 'global' ? 'lucide:cloud' : 'lucide:cpu'" size="14" class="shrink-0 opacity-60" />
                <span class="min-w-0 flex-1 truncate">{{ name }}</span>
                <Icon v-if="provider === group.id && model === name" name="lucide:check" size="14" class="shrink-0" />
              </button>
              <p v-if="!group.models.length" class="px-2.5 py-2 text-xs leading-relaxed text-surface-500" role="status">
                {{ !configured(group.id) ? t('configureModelProvider') : connections[group.id].checking ? t('loadingModels') : connections[group.id].status === 'error' ? t('modelListConnectionError') : t('noModelsFound') }}
              </p>
            </div>
          </section>
          <p v-if="!providers.length || (search.trim() && !hasMatches)" class="px-3 py-6 text-center text-xs text-surface-500" role="status">{{ t(providers.length ? 'noModelsFound' : 'noEnabledProviders') }}</p>
        </div>
        <NuxtLink to="/settings" class="flex items-center gap-2 border-t border-surface-200 px-3 py-2.5 text-xs text-surface-500 hover:text-primary-500 dark:border-surface-800" @click="open = false"><Icon name="lucide:settings-2" size="14" />{{ t('settings') }}</NuxtLink>
      </div>
    </template>
  </UPopover>
</template>
