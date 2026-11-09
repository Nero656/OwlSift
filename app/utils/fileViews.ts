export const fileViews = [
  { value: 'list', label: 'listView', icon: 'i-lucide-list' },
  { value: 'grid', label: 'gridView', icon: 'i-lucide-layout-grid' },
  { value: 'compact', label: 'compactFileView', icon: 'i-lucide-grid-3x3' },
] as const

export type FileView = typeof fileViews[number]['value']

export const compactFilePageSize = 9 * 9
