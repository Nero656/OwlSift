export default defineNuxtPlugin(() => {
  const { loadLanguage } = useLanguage()
  const { settings, load, save, applyTheme } = useSettings()
  loadLanguage()
  load()

  watch(() => [settings.value.theme, settings.value.customization], applyTheme, { deep: true })
  let pending: ReturnType<typeof setTimeout> | undefined
  const persist = () => {
    if (pending === undefined) return
    clearTimeout(pending)
    pending = undefined
    try { save() } catch (cause) { console.warn('Could not save settings:', cause) }
  }
  watch(settings, () => {
    if (pending !== undefined) clearTimeout(pending)
    pending = setTimeout(persist, 150)
  }, { deep: true, flush: 'post' })
  window.addEventListener('pagehide', persist)
})
