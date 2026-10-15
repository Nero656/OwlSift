<script setup lang="ts" generic="T extends string | number | null">
import type { DropdownMenuItem } from '@nuxt/ui'

defineOptions({ inheritAttrs: false })
const model = defineModel<T>()
const props = withDefaults(defineProps<{
  options: Array<{ label: string; value: T; disabled?: boolean }>
  placeholder?: string
  disabled?: boolean
}>(), { placeholder: '', disabled: false })
const { t } = useLanguage()
const attrs = useAttrs()
const root = ref<HTMLElement | null>(null)
const portal = shallowRef<boolean | HTMLElement>(true)
const triggerAttrs = computed(() => {
  const { class: _class, ...rest } = attrs
  return rest
})
const selectedLabel = computed(() => props.options.find(option => Object.is(option.value, model.value))?.label ?? props.placeholder)
const items = computed<DropdownMenuItem[]>(() => props.options.map(option => ({
  label: option.label,
  type: 'checkbox',
  checked: Object.is(option.value, model.value),
  disabled: option.disabled,
  onSelect: () => { if (!option.disabled) model.value = option.value },
})))
onMounted(() => {
  // Native dialog content must remain in its top layer, including menu portals.
  portal.value = root.value?.closest('dialog') ?? true
})
</script>

<template>
  <div ref="root" :class="['min-w-0', attrs.class]">
    <UDropdownMenu v-slot="{ open }" :items="items" :disabled="disabled || !options.length"
      :portal="portal" :modal="false" :content="{ align: 'start', sideOffset: 6, collisionPadding: 12 }"
      :filter="options.length > 10 ? { placeholder: t('search') } : false"
      :ui="{ content: 'min-w-[var(--reka-dropdown-menu-trigger-width)] max-w-[min(28rem,calc(100vw-2rem))] max-h-[min(20rem,var(--reka-dropdown-menu-content-available-height))] overflow-y-auto z-[150]', item: 'cursor-pointer', itemLabel: 'break-words whitespace-normal' }">
      <UButton v-bind="triggerAttrs" type="button" color="neutral" variant="outline" size="sm"
        class="w-full min-w-0 justify-between rounded-lg" :disabled="disabled || !options.length"
        :title="selectedLabel">
        <span class="min-w-0 truncate">{{ selectedLabel }}</span>
        <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 transition-transform" :class="open ? 'rotate-180' : ''" />
      </UButton>
    </UDropdownMenu>
  </div>
</template>
