import type { ChatFileReference } from '~/types/file'
import { scriptFileExtensions } from './fileTypeGroups'

function artifactPreview(value: string, language: string, references: ChatFileReference[]): ChatContentPart | undefined {
  let artifact: Record<string, unknown>
  try { artifact = JSON.parse(value) } catch { return undefined }
  if (!artifact || Array.isArray(artifact) || typeof artifact.content !== 'string') return undefined
  const reference = references.find(file => file.id === artifact.id || (
    typeof artifact.name === 'string' && typeof artifact.extension === 'string'
    && file.name === `${artifact.name}.${artifact.extension}`
  ))
  if (!['owlsift-edit', 'localmind-file'].includes(language) && !reference) return undefined
  const extension = reference?.extension ?? (typeof artifact.extension === 'string' ? artifact.extension : '')
  return { kind: scriptFileExtensions.has(extension.toLowerCase()) ? 'code' : 'text', text: artifact.content }
}
export type ChatContentPart = { kind: 'text' | 'code' | 'inlineCode'; text: string } | { kind: 'link' | 'image'; text: string; url: string }

export function safeChatUrl(value: string, image = false): string | undefined {
  const url = value.trim()
  if (image && /^data:image\/(?:png|jpeg|jpg|gif|webp|avif);base64,[a-z0-9+/=\s]+$/i.test(url) && url.length <= 20000000) return url
  try { const parsed = new URL(url); return ['https:', 'http:'].includes(parsed.protocol) ? parsed.href : undefined } catch { return undefined }
}

/** Parse only links, images and code; message text is never inserted as HTML. */
export function chatContentParts(text: string, references: ChatFileReference[] = []): ChatContentPart[] {
  const rawArtifact = artifactPreview(text, '', references)
  if (rawArtifact) return [rawArtifact]
  const parts: ChatContentPart[] = []
  const pattern = /\x60\x60\x60[\s\S]*?\x60\x60\x60|\x60[^\x60\n]+\x60|(!?)\[([^\]\n]*)\]\(([^)\n]+)\)|https?:\/\/[^\s<>\x60"\']+/g
  let position = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index! > position) parts.push({ kind: 'text', text: text.slice(position, match.index) })
    const raw = match[0]
    if (raw.startsWith(String.fromCharCode(96).repeat(3))) {
      const block = /^```([^\n`]*)\r?\n([\s\S]*?)```$/.exec(raw)
      const language = block?.[1]?.trim().toLowerCase() ?? ''
      const content = block?.[2] ?? raw.slice(3, -3)
      const previous = parts.at(-1)
      const marker = previous?.kind === 'text'
        ? /(?:^|\n)[ \t]*(owlsift-edit|localmind-file)[ \t]*\r?\n?[ \t]*$/i.exec(previous.text)?.[1]?.toLowerCase()
        : undefined
      const preview = artifactPreview(content, marker ?? language, references)
      if (preview) {
        if (previous?.kind === 'text') previous.text = previous.text.replace(/(?:^|\n)[ \t]*(?:owlsift-edit|localmind-file)[ \t]*\r?\n?[ \t]*$/i, '')
        parts.push(preview)
      } else {
        parts.push({ kind: 'code', text: content })
      }
    } else if (raw.startsWith(String.fromCharCode(96))) {
      parts.push({ kind: 'inlineCode', text: raw.slice(1, -1) })
    } else if (/^https?:/i.test(raw)) {
      const url = raw.replace(/[.,;!?]+$/, '')
      const image = /\.(?:png|jpe?g|gif|webp|bmp|avif|svg)(?:[?#]|$)/i.test(url)
      parts.push({ kind: image ? 'image' : 'link', text: url, url })
      if (url.length < raw.length) parts.push({ kind: 'text', text: raw.slice(url.length) })
    } else {
      const url = match[3]!.trim().replace(/\s+["'][^"']*["']$/, '').replace(/^<|>$/g, '')
      parts.push({ kind: match[1] ? 'image' : 'link', text: match[2]!, url })
    }
    position = match.index! + raw.length
  }
  if (position < text.length) parts.push({ kind: 'text', text: text.slice(position) })
  return parts
}

/** Preserve provider image parts in the same format as normal Markdown image responses. */
export function modelContentToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(modelContentToText).join('')
  if (!content || typeof content !== 'object') return ''
  const part = content as Record<string, unknown>
  const image = part.image_url
  const url = typeof image === 'string' ? image : image && typeof image === 'object' ? (image as { url?: unknown }).url : ['image', 'output_image'].includes(String(part.type)) ? part.url : undefined
  if (typeof url === 'string' && safeChatUrl(url, true)) return '\n![Image](' + safeChatUrl(url, true)!.replace(/\(/g, '%28').replace(/\)/g, '%29') + ')\n'
  return modelContentToText(part.text ?? part.content ?? part.value ?? '')
}
