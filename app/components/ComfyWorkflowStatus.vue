<script setup lang="ts">
import { useComfy } from '~/composables/useComfy'
const { connected, assessment, workflowError } = useComfy()
const { t } = useLanguage()
</script>
<template>
  <div class="space-y-2 text-xs" aria-live="polite">
    <p v-if="workflowError" class="break-words text-rose-500">{{ workflowError }}</p>
    <template v-if="connected && !workflowError">
      <p class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium" :class="assessment.execution === 'local' ? 'bg-green-500/10 text-green-700 dark:text-green-400' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'">
        <Icon :name="assessment.execution === 'local' ? 'lucide:hard-drive' : 'lucide:cloud'" size="14" />{{ t(assessment.execution === 'local' ? 'comfyLocalWorkflow' : assessment.execution === 'cloud' ? 'comfyCloudWorkflow' : 'comfyUnknownWorkflow') }}
      </p>
      <p v-if="assessment.cloudNodes.length" class="break-all text-amber-700 dark:text-amber-400">{{ assessment.cloudNodes.join(', ') }}</p>
      <p v-if="assessment.unknownNodes.length" class="break-all text-amber-700 dark:text-amber-400">{{ t('comfyUnknownWorkflow') }}: {{ assessment.unknownNodes.join(', ') }}</p>
      <p v-if="assessment.missingNodes.length" class="break-all text-rose-500">{{ t('comfyMissingNodes') }} {{ assessment.missingNodes.join(', ') }}</p>
    </template>
  </div>
</template>
