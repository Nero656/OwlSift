import type { ChatFileReference } from '~/types/file'

/** Older clients appended file links to the text; attachments render them once. */
export function stripGeneratedFileSummary(text: string, outputs: ChatFileReference[]): string {
  if (!outputs.length) return text
  const footer = /(?:^|\n)\s*(?:Созданные документы|Измен[её]нные документы|Created documents|Edited documents)\s*:\s*((?:\[[^\]\n]*\]\((?:owlsift-file|localmind-file):\d+\)(?:\s*·\s*)?)+)\s*$/i
  const heading = /(?:^|\n)\s*(?:Созданные документы|Измен[её]нные документы|Created documents|Edited documents)\s*:?\s*$/i
  const outputIds = new Set(outputs.map(file => Number(file.id)))
  let body = text
  let match: RegExpExecArray | null
  while ((match = footer.exec(body))) {
    const linkedIds = [...match[1]!.matchAll(/\((?:owlsift-file|localmind-file):(\d+)\)/g)].map(link => Number(link[1]))
    if (!linkedIds.length || linkedIds.some(id => !outputIds.has(id))) break
    body = body.slice(0, match.index).trimEnd()
  }
  return body.replace(heading, '').trimEnd()
}
