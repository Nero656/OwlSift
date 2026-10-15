
export class ModelApiError extends Error {
  constructor(message: string, public status: number, public code = '') {
    super(message)
    this.name = 'ModelApiError'
  }
}

export const normalizeApiKey = (value: string) => {
  let key = value.trim().replace(/^Bearer\s+/i, '').trim()
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) key = key.slice(1, -1).trim()
  return key
}

export async function readModelApiError(response: Response): Promise<ModelApiError> {
  const text = await response.text()
  let message = 'HTTP ' + response.status, code = ''
  try {
    const payload = JSON.parse(text)
    const error = payload.error ?? payload
    if (typeof error === 'string') message = error
    else {
      if (typeof error.message === 'string') message = error.message
      if (typeof error.code === 'string') code = error.code
    }
  } catch { /* Do not expose HTML responses or request headers. */ }
  return new ModelApiError(message, response.status, code)
}
