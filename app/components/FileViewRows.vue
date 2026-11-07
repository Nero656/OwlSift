<script setup lang="ts">
import type { FileView } from '~/utils/fileViews'

const props = defineProps<{ view: FileView }>()
const layoutClass = computed(() => {
  if (props.view === 'grid') return 'grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3'
  return props.view === 'compact' ? 'compact-file-grid' : 'flex flex-col gap-3'
})
</script>

<template>
  <div v-auto-animate="{ duration: 150, easing: 'ease-out' }" :class="layoutClass">
    <slot />
  </div>
</template>

<style scoped>
.compact-file-grid {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, max(5.5rem, calc((100% - 4rem) / 9))), 1fr));
}
</style>
