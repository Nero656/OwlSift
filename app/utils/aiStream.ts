export type AiFeedback = (stage: string, text?: string) => void

// Read SSE frames across arbitrary UTF-8 and network chunk boundaries.
export async function readAiStream(response: Response, feedback: AiFeedback): Promise<string> {
  if (!response.body) throw new Error('Missing response stream')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = '', answer = '', done = false
  const frame = (data: string) => {
    if (data.trim() === '[DONE]') { done = true; return }
    if (!data.trim()) return
    const event = JSON.parse(data)
    if (event.error) throw new Error(event.error.message || 'Model stream failed')
    const delta = event.choices?.[0]?.delta
    const content = delta?.content
    const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map(part => part.text || '').join('') : ''
    if (text) { answer += text; feedback('receiving', answer) }
    else if (delta?.reasoning_content || delta?.reasoning) feedback('processing')
    else if (!answer) feedback('waiting')
  }
  const drain = (final = false) => {
    let match: RegExpExecArray | null
    while ((match = /\r?\n\r?\n/.exec(buffer))) {
      const block = buffer.slice(0, match.index)
      buffer = buffer.slice(match.index + match[0].length)
      frame(block.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n'))
      if (done) return
    }
    if (final && buffer.trim()) {
      frame(buffer.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n'))
      buffer = ''
    }
  }
  try {
    while (!done) {
      const chunk = await reader.read()
      buffer += decoder.decode(chunk.value, { stream: !chunk.done })
      drain(chunk.done)
      if (chunk.done) break
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  return answer
}