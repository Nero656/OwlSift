<script setup lang="ts">
import { useComfy } from '~/composables/useComfy'
const props = withDefaults(defineProps<{ chatKey?: string }>(), { chatKey: 'general' })
const { t } = useLanguage()
const { settings } = useSettings()
const { folders, selectedFolder } = useFiles()
const { connected, busy, job, error, assessment, workflowError, generate, stop } = useComfy()
const chatKey = computed(() => props.chatKey)
const { refineImagePrompt, isThinking, modelReady, activeModelConfig, lastError } = useAi(undefined, chatKey)
const prompt = ref('')
const negative = ref('blurry, low quality, watermark')
const size = ref('512x512')
const seed = ref(1)
const randomSeed = ref(true)
const targetFolder = ref('')
const action = ref('standard')
const acknowledged = ref(false)
const refining = ref(false)
const actions = computed(() => [
  { value: 'standard', label: t('comfyStandard'), style: '' },
  { value: 'illustration', label: t('comfyIllustration'), style: 'editorial illustration, clear composition, cohesive color palette, detailed artwork' },
  { value: 'product', label: t('comfyProduct'), style: 'professional product photography, studio lighting, clean background, realistic materials' },
  { value: 'icon', label: t('comfyIcon'), style: 'app icon design, centered composition, simple bold silhouette, clean shapes, no text, no lettering' },
])
watch([folders, selectedFolder], () => {
  if (folders.value.some(folder => folder.path === targetFolder.value)) return
  targetFolder.value = folders.value.find(folder => folder.name === selectedFolder.value)?.path ?? folders.value[0]?.path ?? ''
}, { immediate: true })
watch(selectedFolder, name => {
  const folder = folders.value.find(folder => folder.name === name)
  if (folder) targetFolder.value = folder.path
})
watch(() => settings.value.comfy, () => { acknowledged.value = false }, { deep: true })
const canGenerate = computed(() => settings.value.comfy.enabled && connected.value && !workflowError.value && !assessment.value.missingNodes.length && (assessment.value.execution === 'local' || (!settings.value.comfy.localOnly && acknowledged.value)) && Boolean(prompt.value.trim() && targetFolder.value) && !busy.value && !refining.value)
const settingsTab = useState<string | number>('settings-active-tab', () => 'general')
const showSettings = () => { settingsTab.value = 'comfy' }
const refine = async () => {
  if (!prompt.value.trim() || isThinking.value) return
  refining.value = true
  try { const improved = await refineImagePrompt(prompt.value); if (improved) prompt.value = improved }
  finally { refining.value = false }
}
const run = async () => {
  const [width, height] = size.value.split('x').map(Number)
  if (randomSeed.value) seed.value = Math.floor(Math.random() * 2147483647)
  const style = actions.value.find(item => item.value === action.value)?.style
  await generate({ prompt: [prompt.value.trim(), style].filter(Boolean).join(', '), negative: negative.value, seed: Number(seed.value), width: width!, height: height!, folderPath: targetFolder.value, chatKey: props.chatKey, acknowledgeExternal: acknowledged.value })
}
</script>
<template>
  <AppDisclosure :title="t('comfyGenerateTitle')" class="mb-4">
    <div class="space-y-4">
      <p class="text-xs text-surface-500">{{ t('comfySeparateProviders') }}</p>
      <NuxtLink v-if="!settings.comfy.enabled || !connected" to="/settings" class="inline-flex text-xs text-primary-700 underline dark:text-primary-400" @click="showSettings">{{ t('comfyConnectFirst') }}</NuxtLink>
      <template v-if="settings.comfy.enabled">
        <ComfyWorkflowStatus />
        <div class="flex flex-wrap gap-2"><button v-for="item in actions" :key="item.value" type="button" class="rounded-lg border px-3 py-2 text-xs" :class="action === item.value ? 'border-primary-500 bg-primary-500/10 text-primary-700 dark:text-primary-300' : 'border-surface-200 dark:border-surface-700'" :aria-pressed="action === item.value" @click="action = item.value">{{ item.label }}</button></div>
        <label class="block text-xs">{{ t('comfyPrompt') }}<textarea v-model="prompt" rows="3" maxlength="20000" class="mt-2 block w-full rounded-xl border border-surface-200 bg-white p-3 text-sm dark:border-surface-700 dark:bg-surface-900" /></label>
        <div class="space-y-2">
          <UButton size="sm" variant="outline" color="neutral" :loading="refining" :disabled="!modelReady || isThinking || !prompt.trim() || refining" @click="refine">{{ t('comfyRefine') }}</UButton>
          <p class="text-[11px] text-surface-500">{{ activeModelConfig.model }} · {{ t('comfyRefineHint') }}</p>
          <p v-if="settings.modelProvider === 'global'" class="text-[11px] text-amber-700 dark:text-amber-400">{{ t('comfyRemoteText') }}</p>
          <p v-if="lastError" role="alert" class="text-xs text-rose-500">{{ lastError }}</p>
        </div>
        <label class="block text-xs">{{ t('comfyNegative') }}<input v-model="negative" class="mt-2 block w-full rounded-xl border border-surface-200 bg-white px-3 py-2 dark:border-surface-700 dark:bg-surface-900"></label>
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="text-xs">{{ t('comfyFolder') }}<AppDropdown v-model="targetFolder" :options="folders.map(folder => ({ value: folder.path, label: folder.name }))" :disabled="busy || !folders.length" class="mt-2" /></label>
          <label v-if="settings.comfy.workflowMode === 'builtin'" class="text-xs">{{ t('comfySize') }}<AppDropdown v-model="size" :options="['512x512', '768x512', '512x768', '1024x1024'].map(value => ({ value, label: value.replace('x', ' × ') }))" class="mt-2" /></label>
        </div>
        <p v-if="!folders.length" class="text-xs text-amber-600">{{ t('comfyProjectRequired') }}</p>
        <p v-if="settings.comfy.workflowMode === 'custom'" class="text-[11px] text-surface-500">{{ t('comfyCustomSizeHint') }}</p>
        <div class="flex flex-wrap items-center gap-3 text-xs"><label class="flex items-center gap-2"><input v-model="randomSeed" type="checkbox">{{ t('comfyRandomSeed') }}</label><label class="flex items-center gap-2">{{ t('comfySeed') }}<input v-model.number="seed" type="number" min="0" step="1" :disabled="randomSeed" class="w-36 rounded-lg border border-surface-200 bg-white px-2 py-1.5 dark:border-surface-700 dark:bg-surface-900"></label></div>
        <label v-if="assessment.execution !== 'local'" class="flex items-start gap-2 text-xs leading-relaxed text-amber-700 dark:text-amber-400"><input v-model="acknowledged" type="checkbox" :disabled="settings.comfy.localOnly" class="mt-0.5 shrink-0">{{ t('comfyExternalConsent') }}</label>
        <div class="flex flex-wrap gap-2"><UButton icon="i-lucide-image-plus" :loading="busy" :disabled="!canGenerate" @click="run">{{ t('comfyGenerate') }}</UButton><UButton v-if="busy" color="neutral" variant="outline" @click="stop">{{ t('comfyStop') }}</UButton></div>
        <div v-if="job" class="space-y-1 rounded-lg border border-surface-200 p-3 text-xs dark:border-surface-700" aria-live="polite"><p>{{ job.status }}</p><p class="break-all text-[11px] opacity-60">{{ t('comfyJob') }}: {{ job.id }} · {{ job.folderPath }}</p><progress v-if="busy && job.progress !== null" :value="job.progress" max="100" class="w-full" /></div>
        <p v-if="error" role="alert" class="break-words text-xs text-rose-500">{{ error }}</p>
      </template>
      <p class="text-[11px] leading-relaxed text-surface-500">{{ t('comfyMediaSearchHint') }}</p>
    </div>
  </AppDisclosure>
</template>
