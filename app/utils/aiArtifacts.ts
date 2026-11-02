import type { LocalFile } from '../types/file'
import { creatableFileTypes } from '../composables/useFileTypes'
import { isHiddenPath } from '../../src/utils/fileVisibility'

const extraTextFormats = new Set(['markdown', 'xml', 'htm', 'scss', 'yaml', 'yml', 'sql', 'java', 'c', 'cpp', 'h', 'sh'])
export const canEditAiFile = (file: LocalFile) => !isHiddenPath(file.path) && (creatableFileTypes.some(type => type.extension === file.extension) || extraTextFormats.has(file.extension))
export interface AiArtifactPlan {
  creations: Array<{ name: string; extension: string; content: string }>
  edits: Array<{ id: number; content: string }>
}
function isValidDelimitedText(value: string, delimiter: ',' | '\t') {
  let inQuotes = false, afterQuote = false, fieldStart = true, fields = 1, expectedFields: number | undefined, rowHasContent = false
  const finishRow = () => {
    if (!rowHasContent) return true
    if (expectedFields !== undefined && fields !== expectedFields) return false
    expectedFields = fields
    fields = 1; fieldStart = true; afterQuote = false; rowHasContent = false
    return true
  }
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!
    if (inQuotes) {
      if (char === '"') {
        if (value[index + 1] === '"') index += 1
        else { inQuotes = false; afterQuote = true }
      }
      continue
    }
    if (char === '"') {
      if (!fieldStart) return false
      inQuotes = true; fieldStart = false; rowHasContent = true
    } else if (char === delimiter) {
      fields += 1; fieldStart = true; afterQuote = false; rowHasContent = true
    } else if (char === '\n' || char === '\r') {
      if (!finishRow()) return false
      if (char === '\r' && value[index + 1] === '\n') index += 1
    } else {
      if (afterQuote && !/\s/.test(char)) return false
      if (!/\s/.test(char)) rowHasContent = true
      fieldStart = false
    }
  }
  return !inQuotes && finishRow()
}
/** Validate the whole reply before writing any document. Model paths are never accepted. */
export function parseAiArtifacts(reply: string, selected: LocalFile[], canCreate: boolean, canEdit: boolean, requiredExtension?: string, requiredName?: string): AiArtifactPlan {
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
    let artifact: { name?: unknown; extension?: unknown; content?: unknown }
    try { artifact = JSON.parse(match[1]!) } catch { throw new Error('Invalid document output') }
    const artifactName = requiredName ?? artifact?.name
    const artifactExtension = requiredExtension ?? artifact?.extension
    if (!artifact || typeof artifactName !== 'string' || !artifactName.trim() || artifactName !== artifactName.trim() || /[\\/:*?"<>|]/.test(artifactName) || isHiddenPath(artifactName) || artifactName.endsWith('.') || typeof artifactExtension !== 'string' || !creatableFileTypes.some(type => type.extension === artifactExtension)) throw new Error('Invalid document name or format')
    const name = artifactName + '.' + artifactExtension
    if (names.has(name.toLowerCase())) throw new Error('Duplicate document output')
    names.add(name.toLowerCase())
    const fileContent = content(artifact.content)
    if (!fileContent.trim()) throw new Error('Invalid document output')
    if (artifactExtension === 'json') {
      try { JSON.parse(fileContent) } catch { throw new Error('Invalid document output') }
    }
    if (artifactExtension === 'csv' && !isValidDelimitedText(fileContent, ',')) throw new Error('Invalid document output')
    if (artifactExtension === 'tsv' && !isValidDelimitedText(fileContent, '\t')) throw new Error('Invalid document output')
    result.creations.push({ name: artifactName, extension: artifactExtension, content: fileContent })
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
