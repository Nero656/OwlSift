<script setup lang="ts">
import { enabledRequestProviders, type RequestProvider } from '../../src/services/localProviders'
defineProps<{ modelValue: RequestProvider; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: RequestProvider] }>()
const { connections } = useAi()
const { settings } = useSettings()
const { t } = useLanguage()
const options = computed(() => ([['ollama', 'Ollama'], ['lmstudio', 'LM Studio (bionic)'], ['global', t('globalModelOption')]] as const).filter(([value]) => enabledRequestProviders(settings.value).includes(value)).map(([value, label]) => ({ value, label: label + (value !== 'lmstudio' && connections.value[value].status === 'ok' ? ' ✓' : '') })))
</script>
<template>
  <label class="flex min-w-0 items-center gap-2 text-xs text-surface-500">
    <span>{{ t('requestProvider') }}</span>
    <AppDropdown :model-value="modelValue" :options="options" :disabled="disabled || !options.length" :placeholder="t('noEnabledProviders')" class="min-w-36" @update:model-value="emit('update:modelValue', $event as RequestProvider)" />
  </label>
</template>
