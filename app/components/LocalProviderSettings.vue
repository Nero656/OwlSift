<script setup lang="ts">
import { localProviderIds } from '../../src/services/localProviders'
const { settings } = useSettings()
const { connections, testConnection } = useAi()
const { t } = useLanguage()
</script>

<template>
  <div class="mt-5 space-y-5">
    <p class="text-sm text-surface-500">{{ t('independentProviderHint') }}</p>
    <label class="block text-sm">{{ t('defaultLocalProvider') }}
      <AppDropdown v-model="settings.localProvider" :options="[{ value: 'ollama', label: 'Ollama' }, { value: 'lmstudio', label: 'LM Studio (bionic)' }]" class="mt-2 w-full" />
    </label>
    <section v-for="id in localProviderIds" :key="id" :data-provider="id" class="rounded-xl border border-surface-200 p-4 dark:border-surface-700">
      <div class="flex items-center justify-between gap-3">
        <h3 class="font-semibold">{{ id === 'ollama' ? 'Ollama' : 'LM Studio (bionic)' }}</h3>
        <UCheckbox v-model="settings.localModels[id].enabled" :label="t('enableProvider')" :aria-label="(id === 'ollama' ? 'Ollama' : 'LM Studio (bionic)') + ' ' + t('enableProvider')" />
      </div>
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <label class="text-sm">{{ t('modelEndpoint') }}
          <input v-model.trim="settings.localModels[id].endpoint" :aria-label="id + ' ' + t('modelEndpoint')" type="url" :placeholder="id === 'ollama' ? 'http://192.168.1.20:11434' : 'http://192.168.1.20:1234/v1'" class="mt-2 block w-full rounded-lg border border-surface-300 bg-transparent p-2 dark:border-surface-700">
        </label>
        <label class="text-sm">{{ t('serverToken') }}
          <input v-model.trim="settings.localModels[id].apiKey" type="password" autocomplete="off" class="mt-2 block w-full rounded-lg border border-surface-300 bg-transparent p-2 dark:border-surface-700">
        </label>
        <label class="text-sm">{{ t('modelName') }}
          <AppDropdown v-model="settings.localModels[id].model" :options="connections[id].models.map(value => ({ value, label: value }))" :placeholder="settings.localModels[id].model || t('selectModel')" :disabled="!connections[id].models.length" class="mt-2 w-full" />
        </label>
        <label class="text-sm sm:col-span-2">{{ t('systemPrompt') }}
          <textarea v-model="settings.localModels[id].systemPrompt" rows="3" class="mt-2 block w-full rounded-lg border border-surface-300 bg-transparent p-2 dark:border-surface-700" />
        </label>
      </div>
      <p v-if="connections[id].status === 'ok' && settings.localModels[id].model && !connections[id].models.includes(settings.localModels[id].model) && connections[id].models.length" class="mt-2 text-xs text-amber-600">{{ t('localModelUnavailable') }}</p>
      <p class="mt-3 text-xs text-surface-500">{{ t('localLanHint') }}</p>
      <button type="button" class="mt-3 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" :disabled="!settings.localModels[id].enabled || connections[id].checking" @click="testConnection(id).catch(() => {})">
        {{ connections[id].checking ? t('sqliteChecking') : t('testConnection') }}
      </button>
      <p v-if="connections[id].error" role="alert" class="mt-2 text-xs text-rose-500">{{ connections[id].error }}</p>
      <p v-else-if="connections[id].status === 'ok'" role="status" class="mt-2 text-xs text-primary-600">{{ connections[id].models.length ? t('connectionOk') + ' ' + connections[id].models.length : t('localNoModelsHint') }}</p>
    </section>
  </div>
</template>
