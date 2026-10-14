export interface LocalModelConfig {
  enabled: boolean
  endpoint: string
  model: string
  systemPrompt: string
}

export interface InterfaceSettings {
  theme: 'dark' | 'light'
  compactSidebar: boolean
  fileView: 'list' | 'grid'
  pageSize: number
  localModel: LocalModelConfig
}

const storageKey = 'localmind-interface-settings'
const defaults = (): InterfaceSettings => ({
  theme: 'dark', compactSidebar: false, fileView: 'grid', pageSize: 50,
  localModel: {
    enabled: false, endpoint: 'http://127.0.0.1:11434', model: '',
    systemPrompt: 'You are a helpful local assistant. Answer using the supplied file context when it is available.',
  },
})

export const useSettings = () => {
  const settings = useState<InterfaceSettings>('interface-settings', defaults)
  const hasLoaded = useState('interface-settings-loaded', () => false)
  const applyTheme = () => {
    if (!import.meta.client) return
    document.documentElement.classList.toggle('dark', settings.value.theme === 'dark')
  }
  const save = () => {
    if (!import.meta.client) return
    localStorage.setItem(storageKey, JSON.stringify(settings.value))
    applyTheme()
  }
  const load = () => {
    if (!import.meta.client || hasLoaded.value) return
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
      const initial = defaults()
      settings.value = { ...initial, ...stored, localModel: { ...initial.localModel, ...(stored.localModel ?? {}) } }
    } catch { settings.value = defaults() }
    hasLoaded.value = true
    applyTheme()
  }
  const reset = () => { settings.value = defaults(); save() }
  onMounted(load)
  watch(settings, save, { deep: true })
  return { settings, load, save, reset, applyTheme }
}
