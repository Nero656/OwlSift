<script setup lang="ts">
import AppLogo from './AppLogo.vue'
import { accentColors, neutralColors, themeRadii, defaultCustomization } from '~/utils/theme'
const { settings } = useSettings()
const { t } = useLanguage()
const linkError = ref('')
const swatchColor = (color: { color: string; darkColor: string }) => settings.value.theme === 'dark' ? color.darkColor : color.color
const colorLabel = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)
const openEditor = async (event: MouseEvent) => {
  if (!window.electron) return
  event.preventDefault()
  try { linkError.value = ''; await window.electron.invoke('app:open-ai-doc', 'nuxtTheme') }
  catch { linkError.value = t('themeLinkError') }
}
</script>

<template>
  <div class="mt-6 border-t border-surface-200 pt-6 dark:border-surface-800">
    <h3 class="text-sm font-semibold">{{ t('themeCustomization') }}</h3>
    <div class="mt-5 space-y-5">
      <fieldset>
        <legend class="mb-3 text-sm text-surface-700 dark:text-surface-300">{{ t('accentColor') }}</legend>
        <div class="flex flex-wrap gap-2">
          <button v-for="color in accentColors" :key="color.value" type="button" class="flex size-9 items-center justify-center rounded-full border-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500" :class="settings.customization.primary === color.value ? 'border-surface-900 dark:border-white' : 'border-transparent'" :style="{ backgroundColor: swatchColor(color) }" :aria-label="colorLabel(color.value)" :title="colorLabel(color.value)" :aria-pressed="settings.customization.primary === color.value" @click="settings.customization.primary = color.value">
            <Icon v-if="settings.customization.primary === color.value" name="lucide:check" size="18" class="text-white drop-shadow" />
          </button>
        </div>
      </fieldset>
      <fieldset>
        <legend class="mb-3 text-sm text-surface-700 dark:text-surface-300">{{ t('neutralColor') }}</legend>
        <div class="flex flex-wrap gap-2">
          <button v-for="color in neutralColors" :key="color.value" type="button" class="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition focus-visible:outline-2 focus-visible:outline-primary-500" :class="settings.customization.neutral === color.value ? 'border-primary-500 bg-primary-500/10 text-primary-700 dark:text-primary-300' : 'border-surface-200 dark:border-surface-700'" :aria-pressed="settings.customization.neutral === color.value" @click="settings.customization.neutral = color.value">
            <span class="size-3 shrink-0 rounded-full" aria-hidden="true" :style="{ backgroundColor: swatchColor(color) }" />{{ colorLabel(color.value) }}
          </button>
        </div>
      </fieldset>
      <div class="grid gap-5 sm:grid-cols-2">
        <label class="text-sm text-surface-700 dark:text-surface-300">{{ t('cornerRadius') }}
          <AppDropdown v-model="settings.customization.radius" :options="themeRadii.map(value => ({ value, label: value + ' rem' }))" class="mt-2 w-full" />
        </label>
        <label class="text-sm text-surface-700 dark:text-surface-300">{{ t('interfaceFont') }}
          <AppDropdown v-model="settings.customization.font" :options="[{ value: 'sans', label: t('fontSans') }, { value: 'serif', label: t('fontSerif') }, { value: 'mono', label: t('fontMono') }]" class="mt-2 w-full" />
        </label>
      </div>
      <div class="rounded-2xl border border-surface-200 bg-surface-50 p-5 dark:border-surface-700 dark:bg-surface-800" :aria-label="t('themePreview')">
        <span class="text-xs text-surface-500">{{ t('themePreview') }}</span>
        <div class="mt-3 flex flex-wrap items-center gap-4">
          <AppLogo />
          <div class="min-w-0 flex-1"><p class="font-semibold">OwlSift</p><p class="mt-1 text-sm text-surface-500 dark:text-surface-400">{{ t('themePreviewDescription') }}</p></div>
          <span class="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-xs font-medium text-white"><Icon name="lucide:sparkles" size="14" />{{ t('aiSummary') }}</span>
        </div>
      </div>
      <button type="button" class="text-xs font-medium text-primary-700 underline underline-offset-4 dark:text-primary-400" @click="settings.customization = defaultCustomization()">{{ t('resetThemeStyle') }}</button>
      <AppDisclosure :title="t('themeHelp')">
        <p class="text-sm leading-relaxed text-surface-600 dark:text-surface-300">{{ t('themeHelpDescription') }}</p>
        <a href="https://ui.nuxt.com/theme" target="_blank" rel="noopener noreferrer" class="mt-3 inline-flex items-center gap-1 text-sm text-primary-700 underline dark:text-primary-400" @click="openEditor">{{ t('themeEditorLink') }}<Icon name="lucide:external-link" size="14" /></a>
        <p v-if="linkError" role="alert" class="mt-2 text-xs text-rose-500">{{ linkError }}</p>
      </AppDisclosure>
    </div>
  </div>
</template>
