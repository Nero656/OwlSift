<script setup lang="ts">
import { useComfy } from '~/composables/useComfy'
import { parseComfyWorkflow } from '~/utils/comfyWorkflow'
const { settings } = useSettings()
const config = computed(() => settings.value.comfy)
const { t } = useLanguage()
const { connected, checkpoints, zImageDiffusionModels, zImageTextEncoders, zImageVaes, workflow, testing, verify } = useComfy()
const importError = ref('')
const upload = ref<HTMLInputElement | null>(null)
const nodes = computed(() => Object.entries(workflow.value).map(([value, node]) => ({ value, label: value + ' · ' + node.class_type })))
const optionalNodes = computed(() => [{ value: '', label: t('comfyUnused') }, ...nodes.value])
const modelOptions = (items: string[], selected: string) => [...new Set([selected, ...items].filter(Boolean))].map(value => ({ value, label: value }))
const detect = () => {
  try {
    const graph = parseComfyWorkflow(config.value.workflowJson)
    const sampler = Object.entries(graph).find(([, node]) => node.class_type === 'KSampler')
    const positive = sampler?.[1].inputs.positive
    const negative = sampler?.[1].inputs.negative
    const fallback = Object.entries(graph).find(([, node]) => ['text', 'prompt', 'positive_prompt'].some(input => typeof node.inputs[input] === 'string'))
    const positiveId = Array.isArray(positive) ? String(positive[0]) : fallback?.[0] ?? ''
    const input = ['text', 'prompt', 'positive_prompt'].find(input => typeof graph[positiveId]?.inputs[input] === 'string') ?? 'text'
    config.value.promptBinding = { node: positiveId, input }
    config.value.negativeBinding = { node: Array.isArray(negative) ? String(negative[0]) : '', input: 'text' }
    config.value.seedBinding = { node: sampler?.[0] ?? '', input: 'seed' }
    importError.value = ''
  } catch (issue) { importError.value = issue instanceof Error ? issue.message : String(issue) }
}
const importWorkflow = async (event: Event) => {
  const element = event.target as HTMLInputElement
  const file = element.files?.[0]
  try {
    if (!file) return
    if (file.size > 2000000) throw new Error('Workflow JSON exceeds 2 MB')
    const json = await file.text(); parseComfyWorkflow(json)
    config.value.workflowJson = json; config.value.workflowMode = 'custom'; detect()
  } catch (issue) { importError.value = issue instanceof Error ? issue.message : String(issue) }
  finally { element.value = '' }
}
</script>
<template>
  <section class="rounded-2xl border border-surface-200 bg-white p-4 dark:border-surface-800 dark:bg-surface-900 sm:p-6">
    <label class="flex items-center justify-between gap-3 text-sm font-semibold"><span>{{ t('comfyEnable') }}</span><input v-model="config.enabled" type="checkbox" class="size-5 shrink-0 accent-primary-600"></label>
    <p class="mt-2 text-xs text-surface-500">{{ t('comfySeparateProviders') }}</p>
    <div class="mt-5 grid gap-4 sm:grid-cols-2">
      <label class="text-sm">{{ t('comfyEndpoint') }}<input v-model.trim="config.endpoint" type="url" placeholder="http://localhost:8188" class="mt-2 block w-full rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 dark:border-surface-700 dark:bg-surface-800"></label>
      <label class="text-sm">{{ t('comfyServerToken') }}<input v-model.trim="config.serverToken" type="password" autocomplete="off" class="mt-2 block w-full rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 dark:border-surface-700 dark:bg-surface-800"></label>
      <label class="text-sm">{{ t('comfyTransport') }}<AppDropdown v-model="config.transport" :options="[{ value: 'proxy', label: t('comfyProxy') }, { value: 'direct', label: t('comfyDirect') }]" class="mt-2" /></label>
    </div>
    <div class="mt-4 flex flex-wrap gap-3">
      <UButton icon="i-lucide-plug" :loading="testing" :disabled="testing || !config.enabled || !config.endpoint.trim()" @click="verify">{{ t('comfyConnectButton') }}</UButton>
    </div>
    <ComfyConnectionStatus class="mt-4" />
    <div class="mt-6 space-y-4 border-t border-surface-200 pt-5 dark:border-surface-800">
      <label class="block text-sm">{{ t('comfyMode') }}<AppDropdown v-model="config.workflowMode" :options="[{ value: 'builtin', label: t('comfyBuiltin') }, { value: 'z-image-turbo', label: t('comfyZImageTurbo') }, { value: 'custom', label: t('comfyCustom') }]" class="mt-2" /></label>
      <template v-if="config.workflowMode === 'builtin'">
        <label class="block text-sm">{{ t('comfyCheckpoint') }}<AppDropdown v-model="config.checkpoint" :options="checkpoints.map(value => ({ value, label: value }))" :placeholder="t('comfySelectCheckpoint')" :disabled="!connected || !checkpoints.length" class="mt-2" /></label>
        <p v-if="connected && !checkpoints.length" class="text-xs text-amber-600">{{ t('comfyNoCheckpoints') }}</p>
        <p class="text-xs leading-relaxed text-surface-500">{{ t('comfyCompatibility') }}</p>
      </template>
      <template v-else-if="config.workflowMode === 'z-image-turbo'">
        <p class="text-xs leading-relaxed text-surface-500">{{ t('comfyZImageSetup') }}</p>
        <label class="block text-sm">{{ t('comfyZImageDiffusion') }}<AppDropdown v-model="config.zImageDiffusionModel" :options="modelOptions(zImageDiffusionModels, config.zImageDiffusionModel)" :placeholder="t('comfyZImageChooseDiffusion')" :disabled="!connected || !zImageDiffusionModels.length" class="mt-2" /></label>
        <label class="block text-sm">{{ t('comfyZImageTextEncoder') }}<AppDropdown v-model="config.zImageTextEncoder" :options="modelOptions(zImageTextEncoders, config.zImageTextEncoder)" :placeholder="t('comfyZImageChooseTextEncoder')" :disabled="!connected || !zImageTextEncoders.length" class="mt-2" /></label>
        <label class="block text-sm">{{ t('comfyZImageVae') }}<AppDropdown v-model="config.zImageVae" :options="modelOptions(zImageVaes, config.zImageVae)" :placeholder="t('comfyZImageChooseVae')" :disabled="!connected || !zImageVaes.length" class="mt-2" /></label>
      </template>
      <template v-else>
        <div class="flex flex-wrap gap-2"><UButton variant="outline" color="neutral" @click="upload?.click()">{{ t('comfyImportWorkflow') }}</UButton><UButton variant="outline" color="neutral" @click="detect">{{ t('comfyDetectBindings') }}</UButton><input ref="upload" type="file" accept=".json,application/json" class="hidden" @change="importWorkflow"></div>
        <label class="block text-sm">{{ t('comfyWorkflowJson') }}<textarea v-model="config.workflowJson" rows="9" spellcheck="false" class="mt-2 block w-full rounded-xl border border-surface-200 bg-surface-50 p-3 font-mono text-xs dark:border-surface-700 dark:bg-surface-800" /></label>
        <div v-for="binding in [{ key: 'promptBinding' as const, label: t('comfyPromptNode') }, { key: 'negativeBinding' as const, label: t('comfyNegativeNode') }, { key: 'seedBinding' as const, label: t('comfySeedNode') }]" :key="binding.key" class="grid gap-3 sm:grid-cols-2">
          <label class="text-xs">{{ binding.label }}<AppDropdown v-model="config[binding.key].node" :options="binding.key === 'promptBinding' ? nodes : optionalNodes" class="mt-2" /></label>
          <label class="text-xs">{{ t('comfyInputName') }}<input v-model.trim="config[binding.key].input" class="mt-2 block w-full rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 dark:border-surface-700 dark:bg-surface-800"></label>
        </div>
        <p v-if="importError" class="text-xs text-rose-500">{{ importError }}</p>
      </template>
      <ComfyWorkflowStatus />
      <label class="flex items-center justify-between gap-3 text-sm"><span>{{ t('comfyLocalOnly') }}<span class="mt-1 block text-xs text-surface-500">{{ t('comfyLocalOnlyHint') }}</span></span><input v-model="config.localOnly" type="checkbox" class="size-5 shrink-0 accent-primary-600"></label>
      <p class="text-xs text-surface-500">{{ t('comfyAuditHint') }}</p>
      <label v-if="!config.localOnly" class="block text-sm">{{ t('comfyCloudKey') }}<input v-model.trim="config.cloudApiKey" type="password" autocomplete="off" class="mt-2 block w-full rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 dark:border-surface-700 dark:bg-surface-800"><span class="mt-1 block text-xs text-surface-500">{{ t('comfyCloudKeyHint') }}</span></label>
      <p class="text-xs leading-relaxed text-surface-500">{{ t('comfyMediaSearchHint') }}</p>
    </div>
    <ComfySetupGuide />
  </section>
</template>
