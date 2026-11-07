import { fetchModel, safeProviderError, type ModelRequest } from '../../../src/services/modelTransport'
export default defineEventHandler(async event => {
  const request = await readBody<ModelRequest>(event)
  if (!request || typeof request.endpoint !== 'string' || JSON.stringify(request).length > 2500000) throw createError({ statusCode: 400, statusMessage: 'Invalid model request' })
  const controller = new AbortController()
  const close = () => { if (!event.node.res.writableEnded) controller.abort() }
  event.node.res.once('close', close)
  try {
    const response = await fetchModel(request, controller.signal)
    setHeader(event, 'Content-Type', response.headers.get('content-type') ?? 'application/json')
    setHeader(event, 'Cache-Control', 'no-store')
    if (response.body) return await sendStream(event, response.body)
    return null
  } catch (error) {
    const e = safeProviderError(error, request)
    setResponseStatus(event, e.status || 502)
    return { error: { code: e.code, message: e.message } }
  } finally { event.node.res.off('close', close) }
})
