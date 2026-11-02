export default defineNuxtPlugin(() => {
  const { load, applyTheme } = useSettings()
  load()
  applyTheme()
})
