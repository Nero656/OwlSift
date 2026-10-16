import colors from 'tailwindcss/colors'

export const accentColors = [
  { value: 'emerald', color: colors.emerald[500], darkColor: colors.emerald[400] }, { value: 'green', color: colors.green[500], darkColor: colors.green[400] },
  { value: 'teal', color: colors.teal[500], darkColor: colors.teal[400] }, { value: 'cyan', color: colors.cyan[500], darkColor: colors.cyan[400] },
  { value: 'sky', color: colors.sky[500], darkColor: colors.sky[400] }, { value: 'blue', color: colors.blue[500], darkColor: colors.blue[400] },
  { value: 'indigo', color: colors.indigo[500], darkColor: colors.indigo[400] }, { value: 'violet', color: colors.violet[500], darkColor: colors.violet[400] },
  { value: 'purple', color: colors.purple[500], darkColor: colors.purple[400] }, { value: 'pink', color: colors.pink[500], darkColor: colors.pink[400] },
  { value: 'rose', color: colors.rose[500], darkColor: colors.rose[400] }, { value: 'orange', color: colors.orange[500], darkColor: colors.orange[400] },
] as const
export const neutralColors = [
  { value: 'slate', color: colors.slate[500], darkColor: colors.slate[400] }, { value: 'gray', color: colors.gray[500], darkColor: colors.gray[400] },
  { value: 'zinc', color: colors.zinc[500], darkColor: colors.zinc[400] }, { value: 'neutral', color: colors.neutral[500], darkColor: colors.neutral[400] },
  { value: 'stone', color: colors.stone[500], darkColor: colors.stone[400] },
] as const
export const themeRadii = [0, 0.125, 0.25, 0.375, 0.5] as const
export const themeFonts = {
  sans: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif: 'ui-serif, Georgia, Cambria, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
} as const
export interface ThemeCustomization {
  primary: typeof accentColors[number]['value']
  neutral: typeof neutralColors[number]['value']
  radius: typeof themeRadii[number]
  font: keyof typeof themeFonts
}
export const defaultCustomization = (): ThemeCustomization => ({ primary: 'emerald', neutral: 'gray', radius: 0.25, font: 'sans' })
export function normalizeCustomization(value?: Partial<ThemeCustomization> | null): ThemeCustomization {
  const fallback = defaultCustomization()
  return {
    primary: accentColors.some(color => color.value === value?.primary) ? value!.primary! : fallback.primary,
    neutral: neutralColors.some(color => color.value === value?.neutral) ? value!.neutral! : fallback.neutral,
    radius: themeRadii.includes(value?.radius as typeof themeRadii[number]) ? value!.radius! : fallback.radius,
    font: value?.font && Object.hasOwn(themeFonts, value.font) ? value.font : fallback.font,
  }
}
