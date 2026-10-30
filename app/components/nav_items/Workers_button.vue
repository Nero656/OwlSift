<script setup lang="ts">
interface Props {
  path: string
  name: string
  count?: number | string | null
  active?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  count: null,
  active: false,
})

const emit = defineEmits<{
  (e: 'select', name: string): void
}>()
</script>

<template>
  <NuxtLink
      to="/"
      class="flex w-full items-center justify-between
           rounded-lg px-3.5 py-2 text-left
           text-xs transition-colors"
      :class="
      props.active
        ? 'bg-surface-200/70 font-medium text-surface-900 dark:bg-surface-800 dark:text-surface-100'
        : 'text-surface-500 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800/40'
    "
      @click="emit('select', props.name)"
  >
    <div class="flex min-w-0 items-center gap-2.5">
      <Icon
          name="lucide:folder-git-2"
          size="14"
          class="shrink-0 text-primary-500"
      />

      <span class="truncate">
        {{ props.name }}
      </span>
    </div>

    <span
        v-if="props.count !== null && props.count !== undefined"
        class="shrink-0 text-[10px] text-surface-400"
    >
      {{ props.count }}
    </span>
  </NuxtLink>
</template>
