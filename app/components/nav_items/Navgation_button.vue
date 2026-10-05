<script setup lang="ts">
interface Props {
  id: string | number
  label: string
  icon: string
  route: string
  badge?: string | number | null
  active?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  badge: null,
  active: false,
})
</script>

<template>
  <NuxtLink
      :key="props.id"
      :to="props.route"
      class="flex w-full items-center justify-between
           rounded-xl px-3.5 py-2.5 text-left
           text-xs font-medium transition-all"
      :class="
      props.active
        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800/60'
    "
  >
    <div class="flex items-center gap-3">
      <Icon
          :name="props.icon"
          size="16"
      />

      <span>{{ props.label }}</span>
    </div>

    <span
        v-if="props.badge"
        class="rounded-full bg-gray-200 px-2 py-0.5
             text-[10px] font-bold text-gray-600
             dark:bg-gray-800 dark:text-gray-400"
    >
      {{ props.badge }}
    </span>
  </NuxtLink>
</template>