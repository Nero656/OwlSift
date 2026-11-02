export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const base = String(query.endpoint || 'http://127.0.0.1:1234/v1').replace(/\/+$/, '')
  if (query.provider === 'ollama') {
    const response = await fetch(`${base}/api/tags`)
    if (!response.ok) throw createError({ statusCode: response.status, statusMessage: await response.text() || 'Ollama is unavailable' })
    return await response.json()
  }
  const endpoint = base.endsWith('/v1') ? base : `${base}/v1`
  const response = await fetch(`${endpoint}/models`)
  if (!response.ok) throw createError({ statusCode: response.status, statusMessage: await response.text() || 'LM Studio is unavailable' })
  return await response.json()
})
