import type { LocalFile } from '../types/file'
import { creatableFileTypes } from '../composables/useFileTypes'
import { isHiddenPath } from '../../src/utils/fileVisibility'

const extraTextFormats = new Set(['markdown', 'xml', 'htm', 'scss', 'yaml', 'yml', 'sql', 'java', 'c', 'cpp', 'h', 'sh'])
export const canEditAiFile = (file: LocalFile) => !isHiddenPath(file.path) && (creatableFileTypes.some(type => type.extension === file.extension) || extraTextFormats.has(file.extension))
export interface AiArtifactPlan {
  creations: Array<{ name: string; extension: string; content: string }>
  edits: Array<{ id: number; content: string }>
}
/** Validate the whole reply before writing any document. Model paths are never accepted. */
export function parseAiArtifacts(reply: string, selected: LocalFile[], canCreate: boolean, canEdit: boolean): AiArtifactPlan {
  const creations = [...reply.matchAll(/```localmind-file\s*([\s\S]*?)```/g)]
  const edits = [...reply.matchAll(/```owlsift-edit\s*([\s\S]*?)```/g)]
  if ((reply.includes('```localmind-file') && !creations.length) || (reply.includes('```owlsift-edit') && !edits.length)) throw new Error('Invalid document output')
  if (creations.length && !canCreate) throw new Error('File creation is not permitted')
  if (edits.length && !canEdit) throw new Error('File editing is not permitted')
  if (creations.length > 5 || edits.length > selected.length) throw new Error('Too many document outputs')
  const result: AiArtifactPlan = { creations: [], edits: [] }
  const names = new Set<string>(), ids = new Set<number>()
  let totalSize = 0
  const content = (value: unknown): string => {
    if (typeof value !== 'string' || value.length > 2000000) throw new Error('Invalid document content')
    totalSize += value.length
    if (totalSize > 20000000) throw new Error('Document output is too large')
    return value
  }
  for (const match of creations) {
    const artifact = JSON.parse(match[1]!)
    if (!artifact || typeof artifact.name !== 'string' || !artifact.name.trim() || artifact.name !== artifact.name.trim() || /[\\/:*?"<>|]/.test(artifact.name) || isHiddenPath(artifact.name) || artifact.name.endsWith('.') || !creatableFileTypes.some(type => type.extension === artifact.extension)) throw new Error('Invalid document name or format')
    const name = artifact.name + '.' + artifact.extension
    if (names.has(name.toLowerCase())) throw new Error('Duplicate document output')
    names.add(name.toLowerCase())
    result.creations.push({ name: artifact.name, extension: artifact.extension, content: content(artifact.content) })
  }
  for (const match of edits) {
    const artifact = JSON.parse(match[1]!)
    const file = selected.find(file => file.id === artifact?.id)
    if (!file || !canEditAiFile(file) || ids.has(file.id)) throw new Error('Only selected editable documents may be changed')
    ids.add(file.id)
    result.edits.push({ id: file.id, content: content(artifact.content) })
  }
  return result
}
