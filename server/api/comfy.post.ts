import { requestComfy, type ComfyRequest } from '../../src/services/comfyTransport'
export default defineEventHandler(async event => {
  const request = await readBody<ComfyRequest>(event)
  try { return await requestComfy(request) }
  catch (error) { throw createError({ statusCode: 502, statusMessage: 'Comfy server request failed', data: { message: error instanceof Error ? error.message : String(error) } }) }
})
