<script setup lang="ts">
interface Props {
  id: string | number
  label: string
  icon: string
  route: string
  badge?: string | number | null
  active?: boolean
  compact?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  badge: null,
  active: false,
  compact: false,
})
</script>

<template>
  <NuxtLink
      :key="props.id"
      :to="props.route"
      :prefetch-on="props.route === '/documents' || props.route === '/folders' ? 'visibility' : 'interaction'"
      class="flex w-full items-center justify-between
           rounded-xl py-2.5 text-left
           text-xs font-medium transition-colors"
      :class="[
        props.compact ? 'justify-center px-2' : 'justify-between px-3.5',
        props.active
          ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400'
          : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800/60'
      ]"
      :title="props.compact ? props.label : undefined"
      :aria-label="props.label"
  >
    <div v-auto-animate="{ duration: 180, easing: 'ease-out' }" class="flex min-w-0 items-center gap-3" aria-hidden="true">
      <Icon
          :name="props.icon"
          size="16"
          class="shrink-0"
      />

      <span v-if="!props.compact" class="truncate">{{ props.label }}</span>
    </div>

    <span
        v-if="props.badge && !props.compact"
        class="rounded-full bg-surface-200 px-2 py-0.5
             text-[10px] font-bold text-surface-600
             dark:bg-surface-800 dark:text-surface-400"
    >
      {{ props.badge }}
    </span>
  </NuxtLink>
</template>
