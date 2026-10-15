export interface LocalModelConfig {
  enabled: boolean
  endpoint: string
  model: string
  systemPrompt: string
}

export interface GlobalModelConfig {
  endpoint: string
  apiKey: string
  model: string
  systemPrompt: string
}

export interface InterfaceSettings {
  modelProvider: 'local' | 'global'
  theme: 'dark' | 'light'
  compactSidebar: boolean
  fileView: 'list' | 'grid'
  pageSize: number
  showThumbnails: boolean
  localModel: LocalModelConfig
  globalModel: GlobalModelConfig
}

const storageKey = 'localmind-interface-settings'
export const defaults = (): InterfaceSettings => ({
  theme: 'dark',
  compactSidebar: false,
  fileView: 'grid',
  pageSize: 50,
  showThumbnails: true,
  modelProvider: 'local',
  globalModel: {
    endpoint: 'https://api.openai.com/v1',
    apiKey: '',
    model: '',
    systemPrompt: 'You are a helpful assistant. Answer using the supplied file context when it is available.',
  },
  localModel: {
    enabled: false,
    endpoint: 'http://127.0.0.1:1234/v1',
    model: '',
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
    if (!import.meta.client || !hasLoaded.value) return
    localStorage.setItem(storageKey, JSON.stringify(settings.value))
    applyTheme()
  }

  const load = () => {
    if (!import.meta.client || hasLoaded.value) return
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<InterfaceSettings>
      const initial = defaults()
      const pageSize = [25, 50, 100].includes(Number(stored.pageSize)) ? Number(stored.pageSize) : initial.pageSize
      settings.value = {
        ...initial,
        ...stored,
        theme: stored.theme === 'light' ? 'light' : 'dark',
        fileView: stored.fileView === 'list' ? 'list' : 'grid',
        pageSize,
        showThumbnails: stored.showThumbnails !== false,
        compactSidebar: Boolean(stored.compactSidebar),
        modelProvider: stored.modelProvider === 'global' ? 'global' : 'local',
        localModel: {
          ...initial.localModel,
          ...(stored.localModel ?? {}),
          endpoint: stored.localModel?.endpoint === 'http://127.0.0.1:11434'
            ? initial.localModel.endpoint
            : stored.localModel?.endpoint ?? initial.localModel.endpoint,
        },
        globalModel: { ...initial.globalModel, ...(stored.globalModel ?? {}) },
      }
    } catch {
      settings.value = defaults()
    }
    hasLoaded.value = true
    applyTheme()
  }

  const reset = () => {
    settings.value = defaults()
    hasLoaded.value = true
    save()
  }

  const setTheme = (theme: InterfaceSettings['theme']) => {
    settings.value = { ...settings.value, theme }
  }

  if (import.meta.client && !hasLoaded.value) load()
  watch(settings, save, { deep: true })
  return { settings, load, save, reset, applyTheme, setTheme }
}
