<script setup lang="ts">
import { useComfy } from '~/composables/useComfy'
const { settings } = useSettings()
const { t, language } = useLanguage()
const { connectionStatus, checkedAt, testing, error, verify } = useComfy()
const label = computed(() => testing.value ? t('comfyCheckingStatus') : t({
  ready: 'comfyReadyStatus',
  'workspace-unavailable': 'comfyWorkspaceUnavailableStatus',
  disconnected: 'comfyDisconnectedStatus',
  unchecked: 'comfyUncheckedStatus',
}[connectionStatus.value] as 'comfyReadyStatus' | 'comfyWorkspaceUnavailableStatus' | 'comfyDisconnectedStatus' | 'comfyUncheckedStatus'))
const color = computed(() => testing.value || connectionStatus.value === 'unchecked'
  ? 'border-surface-200 bg-surface-50 text-surface-600 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-300'
  : connectionStatus.value === 'ready'
    ? 'border-green-500/30 bg-green-500/5 text-green-700 dark:text-green-400'
    : connectionStatus.value === 'workspace-unavailable'
      ? 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400'
      : 'border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-400')
const time = computed(() => checkedAt.value ? new Date(checkedAt.value).toLocaleTimeString(language.value) : '')
onMounted(() => { void verify() })
watch(() => [settings.value.comfy.endpoint, settings.value.comfy.serverToken, settings.value.comfy.transport], (_, __, cleanup) => {
  const timer = setTimeout(() => { void verify() }, 400)
  cleanup(() => clearTimeout(timer))
})
</script>

<template>
  <section class="min-w-0 rounded-xl border p-3" :class="color" :aria-label="t('comfyConnectionWidget')" :aria-busy="testing">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0 flex-1">
        <p class="flex items-start gap-2 text-sm font-semibold" role="status" aria-live="polite">
          <Icon :name="testing ? 'lucide:loader-circle' : connectionStatus === 'ready' ? 'lucide:circle-check' : connectionStatus === 'workspace-unavailable' ? 'lucide:triangle-alert' : 'lucide:unplug'" size="17" class="mt-0.5 shrink-0" :class="{ 'animate-spin': testing }" />
          <span>{{ label }}</span>
        </p>
        <p class="mt-1 break-all text-xs opacity-75">{{ settings.comfy.endpoint.replace(/\/+$/, '') }}/</p>
      </div>
      <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-refresh-cw" :loading="testing" :disabled="testing || !settings.comfy.endpoint.trim()" @click="verify">{{ t('comfyRetryConnection') }}</UButton>
    </div>
    <p class="mt-2 text-[11px] leading-relaxed opacity-80">{{ t('comfyWorkspaceStatusHint') }}</p>
    <p v-if="time && !testing" class="mt-1 text-[11px] opacity-70">{{ t('comfyLastChecked') }}: {{ time }}</p>
    <p v-if="error && !testing" role="alert" class="mt-2 break-words text-xs">{{ error }}</p>
  </section>
</template>
