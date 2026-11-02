export default defineEventHandler(async (event) => {
  const body = await readBody<{ endpoint?: string; model?: string; stream?: boolean; messages?: Array<{ role: string; content: string }> }>(event)
  const base = (body.endpoint || 'http://127.0.0.1:1234/v1').replace(/\/+$/, '')
  const endpoint = base.endsWith('/v1') ? base : `${base}/v1`
  if (!body.model) throw createError({ statusCode: 400, statusMessage: 'Model name is required' })

  const controller = new AbortController()
  const onClose = () => { if (!event.node.res.writableEnded) controller.abort() }
  event.node.res.once('close', onClose)
  try {
    const response = await fetch(`${endpoint}/chat/completions`, {
      signal: controller.signal,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: body.model, messages: body.messages ?? [], stream: body.stream === true }),
    })
    if (!response.ok) throw createError({ statusCode: response.status, statusMessage: await response.text() || 'LM Studio request failed' })
    if (response.headers.get('content-type')?.includes('text/event-stream') && response.body) {
      setHeader(event, 'Content-Type', 'text/event-stream')
      setHeader(event, 'Cache-Control', 'no-cache')
      setHeader(event, 'X-Accel-Buffering', 'no')
      return await sendStream(event, response.body)
    }
    return await response.json()
  } finally { event.node.res.off('close', onClose) }
})