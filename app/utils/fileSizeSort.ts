import type { LocalFile } from '~/types/file'

export const fileSizeSortOptions = [
  { value: 'size-asc', label: 'sortSizeAscending' },
  { value: 'size-desc', label: 'sortSizeDescending' },
] as const

type SizedFile = Pick<LocalFile, 'size' | 'sizeBytes' | 'name'>

function sizeInBytes(file: SizedFile): number | undefined {
  if (typeof file.sizeBytes === 'number' && Number.isFinite(file.sizeBytes) && file.sizeBytes >= 0) return file.sizeBytes

  // Browser files saved before byte counts were stored retain their formatted size.
  const match = file.size?.match(/^\s*(\d+(?:\.\d+)?)\s*(B|KB|MB)\s*$/)
  if (!match) return undefined
  const bytes = Number(match[1]) * 1024 ** ['B', 'KB', 'MB'].indexOf(match[2]!)
  return Number.isFinite(bytes) ? bytes : undefined
}

export function compareFileSizes(a: SizedFile, b: SizedFile, descending: boolean): number {
  const left = sizeInBytes(a)
  const right = sizeInBytes(b)
  if (left === undefined || right === undefined) {
    if (left !== right) return left === undefined ? 1 : -1
  } else if (left !== right) {
    return descending ? right - left : left - right
  }
  return a.name.localeCompare(b.name)
}
