import type { ComfySettings } from '~/types/media'
import { fileViews, type FileView } from '~/utils/fileViews'
import { defaultComfySettings, normalizeComfySettings } from '~/utils/comfyWorkflow'
import { defaultCustomization, normalizeCustomization, themeFonts, type ThemeCustomization } from '~/utils/theme'

import { defaultLocalModels, restoreLocalModels, restoreGlobalEnabled, type LocalModelConfig, type LocalProvider } from '../../src/services/localProviders'
export type { LocalModelConfig } from '../../src/services/localProviders'

export type GlobalApiProvider = 'openai' | 'gemini' | 'deepseek'

export interface GlobalModelConfig {
  enabled: boolean
  provider: GlobalApiProvider
  endpoint: string
  apiKey: string
  providerKeys: Partial<Record<GlobalApiProvider, string>>
  model: string
  systemPrompt: string
}

export interface InterfaceSettings {
  comfy: ComfySettings
  modelProvider: 'local' | 'global'
  theme: 'dark' | 'light' | 'light-cloud' | 'light-silver' | 'light-ash' | 'light-stone'
  customization: ThemeCustomization
  compactSidebar: boolean
  fileView: FileView
  pageSize: number
  documentPageSize: number
  showThumbnails: boolean
  showSystemFiles: boolean
  aiResponseNotifications: boolean
  aiResponseToastDuration: number
  localProvider: LocalProvider
  localModels: Record<LocalProvider, LocalModelConfig>
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
  documentPageSize: defaultDocumentPageSize,
  showThumbnails: true,
  showSystemFiles: false,
  aiResponseNotifications: true,
  aiResponseToastDuration: 5000,
  modelProvider: 'local',
  globalModel: {
    enabled: false,
    provider: 'openai',
    endpoint: 'https://api.openai.com/v1',
    apiKey: '',
    providerKeys: { openai: '', gemini: '', deepseek: '' },
    model: '',
    systemPrompt: 'You are a helpful assistant. Answer using the supplied file context when it is available.',
  },
  localProvider: 'lmstudio',
  localModels: defaultLocalModels(),
})

export const documentPageSizes = [10, 25, 50, 100] as const
const defaultDocumentPageSize = 25

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
    const isDark = settings.value.theme === 'dark'
    root.classList.toggle('light', !isDark)
    root.dataset.lightTone = settings.value.theme === 'light' ? 'white' : settings.value.theme.replace('light-', '')
    root.style.colorScheme = isDark ? 'dark' : 'light'
    if (colorMode.value) colorMode.value.preference = isDark ? 'dark' : 'light'
    root.style.setProperty('--ui-radius', customization.radius + 'rem')
    root.style.setProperty('--app-font', themeFonts[customization.font])
    appConfig.ui.colors.primary = customization.primary
    appConfig.ui.colors.neutral = customization.neutral
  }

  const save = () => {
    if (!import.meta.client || !hasLoaded.value) return
    localStorage.setItem(storageKey, JSON.stringify(settings.value))
  }

  const load = () => {
    if (!import.meta.client || hasLoaded.value) return
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<InterfaceSettings> & { localModel?: Partial<LocalModelConfig> }
      const initial = defaults()
      const pageSize = [25, 50, 100].includes(Number(stored.pageSize)) ? Number(stored.pageSize) : initial.pageSize
      settings.value = {
        ...initial,
        ...stored,
        comfy: normalizeComfySettings(stored.comfy),
        customization: normalizeCustomization(stored.customization),
        theme: ['light', 'light-cloud', 'light-silver', 'light-ash', 'light-stone'].includes(String(stored.theme)) ? stored.theme as InterfaceSettings['theme'] : 'dark',
        fileView: fileViews.find(view => view.value === stored.fileView)?.value ?? initial.fileView,
        pageSize,
        documentPageSize: documentPageSizes.find(size => size === Number(stored.documentPageSize)) ?? defaultDocumentPageSize,
        showThumbnails: stored.showThumbnails !== false,
        showSystemFiles: stored.showSystemFiles === true,
        aiResponseNotifications: stored.aiResponseNotifications !== false,
        aiResponseToastDuration: [3000, 5000, 8000, 10000].includes(Number(stored.aiResponseToastDuration)) ? Number(stored.aiResponseToastDuration) : initial.aiResponseToastDuration,
        compactSidebar: Boolean(stored.compactSidebar),
        modelProvider: stored.modelProvider === 'global' ? 'global' : 'local',
        ...restoreLocalModels(stored),
        globalModel: {
          ...initial.globalModel,
          ...(stored.globalModel ?? {}),
          enabled: restoreGlobalEnabled(stored),
          provider: ['openai', 'gemini', 'deepseek'].includes(String(stored.globalModel?.provider)) ? stored.globalModel!.provider! : 'openai',
          providerKeys: { ...initial.globalModel.providerKeys, ...(stored.globalModel?.providerKeys ?? {}) },
        },
      }
      delete (settings.value as InterfaceSettings & { localModel?: Partial<LocalModelConfig> }).localModel
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
      documentPageSize: initial.documentPageSize,
      showThumbnails: initial.showThumbnails,
      aiResponseNotifications: initial.aiResponseNotifications,
      aiResponseToastDuration: initial.aiResponseToastDuration,
    }
    hasLoaded.value = true
  }

  const setTheme = (theme: InterfaceSettings['theme']) => {
    settings.value = { ...settings.value, theme }
  }

  return { settings, load, save, reset, applyTheme, setTheme }
}
