import { useStorageDriver } from '../../../utils/storage'

// Content-addressed reward key: a 64-hex sha256 plus an image extension. Validated
// here so a stray param can't reach the storage backend.
const KEY_RE = /^[0-9a-f]{64}\.(?:jpg|jpeg|png|webp|gif)$/

export default defineEventHandler(async (event) => {
  const param = getRouterParam(event, 'key') ?? ''
  if (!KEY_RE.test(param)) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  const obj = await useStorageDriver().get(`reward/${param}`)
  if (!obj) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  setHeader(event, 'content-type', obj.contentType)
  // The key is the content hash, so the bytes behind this URL never change.
  setHeader(event, 'cache-control', 'public, max-age=31536000, immutable')
  setHeader(event, 'etag', `"${param}"`)
  return obj.bytes
})

defineRouteMeta({
  openAPI: {
    tags: ['Media'],
    summary: 'Fetch a reward image',
    description: 'Serves a stored reward image by its content-addressed key. Public; immutable and long-cached.',
    parameters: [{ in: 'path', name: 'key', required: true, schema: { type: 'string' } }],
    responses: {
      '200': { description: 'The reward image bytes.' },
      '404': { description: 'No such reward image.' },
    },
  },
})
