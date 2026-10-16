import type { LocalFile } from '../types/file'
export type FileContext = LocalFile | LocalFile[] | null | undefined
export const contextFiles = (context: FileContext): LocalFile[] => [...new Map((Array.isArray(context) ? context : context ? [context] : []).map(file => [file.path, file])).values()]
export const contextKey = (context: FileContext) => {
  const paths = [...new Set(contextFiles(context).map(file => file.path))].sort()
  return paths.length === 1 ? 'file:' + paths[0] : paths.length ? 'group:' + JSON.stringify(paths) : 'general'
}