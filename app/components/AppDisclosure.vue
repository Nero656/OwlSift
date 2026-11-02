<script setup lang="ts">
const props = withDefaults(defineProps<{ title: string; collapsible?: boolean; defaultOpen?: boolean }>(), { collapsible: true, defaultOpen: false })
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const open = ref(props.defaultOpen)
watch(open, value => emit('update:open', value))
const contentId = useId()
</script>

<template>
  <div class="rounded-xl border border-surface-200 bg-surface-50 text-sm dark:border-surface-700 dark:bg-surface-800/40">
    <button v-if="props.collapsible" type="button" class="flex w-full items-center justify-between gap-3 rounded-xl p-4 text-left font-semibold focus-visible:outline-2 focus-visible:outline-primary-500" :aria-expanded="open" :aria-controls="contentId" @click="open = !open">
      <span>{{ props.title }}</span>
      <Icon name="lucide:chevron-down" size="16" class="shrink-0 transition-transform duration-200" :class="{ 'rotate-180': open }" />
    </button>
    <div :id="contentId" class="disclosure-content" :class="{ 'is-open': !props.collapsible || open }" :inert="props.collapsible && !open" :aria-hidden="props.collapsible && !open">
      <div class="min-h-0 overflow-hidden"><div :class="{ 'px-4 pb-4': props.collapsible, 'p-4': !props.collapsible }"><slot /></div></div>
    </div>
  </div>
</template>

<style scoped>
.disclosure-content {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  visibility: hidden;
  transition: grid-template-rows 240ms ease, opacity 180ms ease, visibility 240ms;
}
.disclosure-content.is-open { grid-template-rows: 1fr; opacity: 1; visibility: visible; }
@media (prefers-reduced-motion: reduce) {
  .disclosure-content, button :deep(.iconify) { transition: none; }
}
</style>
