import { requireUser } from '../../utils/auth-guards'
import { unfurlLink } from '../../utils/chat/unfurl'
import type { LinkPreviewDTO } from '../../../shared/types/chat'

// Fetch open-graph metadata for a URL the client pulled out of a (locally
// decrypted) chat message, so it can show a collapsible link preview. Auth-gated
// to keep this from being an open SSRF/fetch proxy; the heavy lifting and the
// host guard live in the unfurl util.
export default defineEventHandler(async (event): Promise<LinkPreviewDTO> => {
  await requireUser(event)
  const url = getQuery(event).url
  const empty: LinkPreviewDTO = { url: typeof url === 'string' ? url : '', title: null, description: null, image: null, siteName: null }
  if (typeof url !== 'string' || url.length > 2048 || !/^https?:\/\//i.test(url)) return empty
  return unfurlLink(url)
})

defineRouteMeta({
  openAPI: {
    tags: ['Chat'],
    summary: 'Unfurl a link',
    description: 'Authenticated. Returns open-graph metadata (title, description, image, site name) for an http(s) URL, for chat link previews. Private/loopback hosts are refused.',
    parameters: [{ in: 'query', name: 'url', required: true, schema: { type: 'string', format: 'uri' } }],
    responses: { '200': { description: 'LinkPreviewDTO (fields null when unavailable).' } },
  },
})
