import type { Ref } from 'vue'

// Mount the first screen of cards immediately and spread the rest across frames.
export function useProgressiveRows<T>(items: Readonly<Ref<T[]>>) {
  const limit = ref(16)
  let frame: number | undefined
  const fill = () => {
    if (frame !== undefined || limit.value >= items.value.length) return
    frame = requestAnimationFrame(() => {
      frame = undefined
      limit.value += 8
      fill()
    })
  }
  onMounted(fill)
  watch(() => items.value.length, fill)
  onBeforeUnmount(() => { if (frame !== undefined) cancelAnimationFrame(frame) })
  return computed(() => items.value.slice(0, limit.value))
}
