import type { ComfySettings } from '~/types/media'
import { defaultComfySettings, normalizeComfySettings } from '~/utils/comfyWorkflow'
import { defaultCustomization, normalizeCustomization, themeFonts, type ThemeCustomization } from '~/utils/theme'

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
  comfy: ComfySettings
  modelProvider: 'local' | 'global'
  theme: 'dark' | 'light'
  customization: ThemeCustomization
  compactSidebar: boolean
  fileView: 'list' | 'grid'
  pageSize: number
  showThumbnails: boolean
  showSystemFiles: boolean
  localModel: LocalModelConfig
  globalModel: GlobalModelConfig
}

const storageKey = 'localmind-interface-settings'
export const defaults = (): InterfaceSettings => ({
  comfy: defaultComfySettings(),
  theme: 'dark',
  customization: defaultCustomization(),
  compactSidebar: false,
  fileView: 'grid',
  pageSize: 50,
  showThumbnails: true,
  showSystemFiles: false,
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
  const appConfig = useAppConfig()
  const colorMode = useState<{ preference: string } | undefined>('color-mode')
  const settings = useState<InterfaceSettings>('interface-settings', defaults)
  const hasLoaded = useState('interface-settings-loaded', () => false)

  const applyTheme = () => {
    if (!import.meta.client) return
    const root = document.documentElement
    const customization = normalizeCustomization(settings.value.customization)
    root.classList.toggle('dark', settings.value.theme === 'dark')
    root.classList.toggle('light', settings.value.theme === 'light')
    root.style.colorScheme = settings.value.theme
    if (colorMode.value) colorMode.value.preference = settings.value.theme
    root.style.setProperty('--ui-radius', customization.radius + 'rem')
    root.style.setProperty('--app-font', themeFonts[customization.font])
    appConfig.ui.colors.primary = customization.primary
    appConfig.ui.colors.neutral = customization.neutral
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
        comfy: normalizeComfySettings(stored.comfy),
        customization: normalizeCustomization(stored.customization),
        theme: stored.theme === 'light' ? 'light' : 'dark',
        fileView: stored.fileView === 'list' ? 'list' : 'grid',
        pageSize,
        showThumbnails: stored.showThumbnails !== false,
        showSystemFiles: stored.showSystemFiles === true,
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
    const initial = defaults()
    settings.value = {
      ...settings.value,
      theme: initial.theme,
      customization: initial.customization,
      compactSidebar: initial.compactSidebar,
      fileView: initial.fileView,
      pageSize: initial.pageSize,
      showThumbnails: initial.showThumbnails,
    }
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
