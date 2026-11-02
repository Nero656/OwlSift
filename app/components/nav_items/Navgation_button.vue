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
      class="flex w-full items-center justify-between
           rounded-xl py-2.5 text-left
           text-xs font-medium transition-all"
      :class="[
        props.compact ? 'justify-center px-2' : 'justify-between px-3.5',
        props.active
          ? 'bg-primary-500/10 text-primary-600 dark:text-primary-400'
          : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800/60'
      ]"
      :title="props.compact ? props.label : undefined"
  >
    <div class="flex items-center gap-3">
      <Icon
          :name="props.icon"
          size="16"
      />

      <span v-if="!props.compact">{{ props.label }}</span>
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
