import type { LocalFile } from '~/types/file'
import type { FileContext } from '~/utils/aiContext'
import type { LanguageKey } from './useLanguage'
import { contextFiles } from '~/utils/aiContext'

type PromptCategory = 'code' | 'spreadsheet' | 'structured' | 'document' | 'presentation' | 'image' | 'log' | 'other' | 'general'
const formats: Partial<Record<PromptCategory, Set<string>>> = {
  code: new Set('js ts jsx tsx cjs mjs vue svelte astro py pyw ipynb java kt kts scala c cpp cc cxx h hpp cs go rs swift m mm php rb pl lua r jl sh bash zsh fish ps1 psm1 bat cmd sql html htm css scss sass less dart ex exs erl hs fs fsharp vb'.split(' ')),
  spreadsheet: new Set('csv tsv xls xlsx xlsm xlsb ods numbers parquet arrow feather'.split(' ')),
  structured: new Set('json jsonl ndjson xml yaml yml toml ini env config properties'.split(' ')),
  document: new Set('pdf doc docx odt rtf txt md markdown rst tex adoc epub pages eml msg'.split(' ')),
  presentation: new Set('ppt pptx odp key'.split(' ')),
  image: new Set('png jpg jpeg gif webp bmp avif svg ico tif tiff heic heif psd ai eps raw cr2 nef'.split(' ')),
  log: new Set('log out err'.split(' ')),
}
const prompts = {
  code: ['promptCodeReview', 'promptCodeExplain', 'promptCodeRefactor'],
  spreadsheet: ['promptDataOverview', 'promptDataQuality', 'promptDataTrends'],
  structured: ['promptStructureExplain', 'promptStructureValidate', 'promptStructureImprove'],
  document: ['promptDocumentSummary', 'promptDocumentFacts', 'promptDocumentActions'],
  presentation: ['promptSlidesSummary', 'promptSlidesStructure', 'promptSlidesNotes'],
  image: ['promptImageOrganize', 'promptImageNames', 'promptImageCatalog'],
  log: ['promptLogErrors', 'promptLogTimeline', 'promptLogDiagnosis'],
  other: ['promptFileOverview', 'promptFileMetadata', 'promptFileNextSteps'],
  general: ['promptGeneralHelp', 'promptGeneralDraft', 'promptGeneralPlan'],
} as const satisfies Record<PromptCategory, readonly LanguageKey[]>

function categoryFor(file: LocalFile): PromptCategory {
  const extension = (file.extension || file.name.split('.').pop() || '').toLowerCase().replace(/^\./, '')
  if (/^\.env(?:\.|$)/i.test(file.name)) return 'structured'
  for (const [category, extensions] of Object.entries(formats)) {
    if (extensions.has(extension)) return category as PromptCategory
  }
  return 'other'
}

/** Suggestions follow the actual request context and react to format and language changes. */
export function useFilePrompts(context: { readonly value: FileContext }, focused?: { readonly value: LocalFile | null }) {
  const { t } = useLanguage()
  return computed(() => {
    const files = contextFiles(context.value)
    if (!files.length) return prompts.general.map(key => t(key))
    const focusedFile = focused?.value
    const ordered = focusedFile && files.some(file => file.id === focusedFile.id)
      ? [focusedFile, ...files.filter(file => file.id !== focusedFile.id)] : files
    const categories = [...new Set(ordered.map(categoryFor))]
    if (categories.length === 1) {
      const keys: LanguageKey[] = [...prompts[categories[0]!]]
      if (files.length > 1) keys[2] = 'promptCompareSelectedFiles'
      return keys.map(key => t(key))
    }
    const keys: LanguageKey[] = categories.slice(0, 3).map(category => prompts[category][0])
    if (keys.length < 3) keys.push('promptCrossCheckFiles')
    return keys.map(key => t(key))
  })
}
