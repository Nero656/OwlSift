/** Recover an edit envelope returned in a generic JSON/code block by the model. */
export function parseAiEditEnvelope(value: string, fileId: number, extension: string): string | undefined {
  let parsed: unknown
  try { parsed = JSON.parse(value) } catch {
    // A broken edit envelope must not become the document's literal contents.
    if (/^\s*\{/.test(value) && /"id"\s*:/.test(value) && /"content"\s*:/.test(value)) throw new Error('Invalid document output')
    return undefined
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
  const artifact = parsed as Record<string, unknown>
  if (!Object.hasOwn(artifact, 'content')) return undefined
  const hasId = Object.hasOwn(artifact, 'id')
  // Without a target id, a JSON document's own content field remains ordinary data.
  if (!hasId && extension.toLowerCase() === 'json') return undefined
  const metadataKeys = new Set(['id', 'content', 'name', 'extension', 'path'])
  if (!hasId && !Object.keys(artifact).every(key => metadataKeys.has(key))) return undefined
  if (hasId && artifact.id !== fileId) throw new Error('Only selected editable documents may be changed')
  if (typeof artifact.content !== 'string' || artifact.content.length > 2000000) throw new Error('Invalid document content')
  return artifact.content
}
