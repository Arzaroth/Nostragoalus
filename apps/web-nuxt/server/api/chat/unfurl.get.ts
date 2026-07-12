import { z } from 'zod'
import { unfurlLink } from '../../utils/chat/unfurl'
import { defineReadHandler } from '../../utils/read-handler'
import { createRateLimiter } from '../../utils/rate-limit'
import type { LinkPreviewDTO } from '#shared/types/chat'

const responseSchema = z.object({
  url: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  image: z.string().nullable(),
  siteName: z.string().nullable(),
})

// This route fetches an attacker-influenced URL server-side (an SSRF-adjacent
// sink), so cap how fast it can be driven. A per-user bucket stops a single
// account from scraping or port-scanning through it; a global bucket is a DoS
// backstop above any real aggregate - link previews fire at most a handful a
// minute across a pool-sized instance, so 120/min can't bite a real user while
// still ceiling a flood. Cache hits and malformed-URL early-returns don't reach
// the limiters (only genuine fetch candidates consume budget).
const perUserLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 })
const globalLimiter = createRateLimiter({ limit: 120, windowMs: 60_000 })

// Fetch open-graph metadata for a URL the client pulled out of a (locally
// decrypted) chat message, so it can show a collapsible link preview. Auth-gated
// to keep this from being an open SSRF/fetch proxy; the heavy lifting and the
// host guard live in the unfurl util.
export default defineReadHandler({ response: responseSchema, auth: 'user' }, async ({ event, user }): Promise<LinkPreviewDTO> => {
  const url = getQuery(event).url
  const empty: LinkPreviewDTO = { url: typeof url === 'string' ? url : '', title: null, description: null, image: null, siteName: null }
  if (typeof url !== 'string' || url.length > 2048 || !/^https?:\/\//i.test(url)) return empty
  if (!perUserLimiter.allow(user.id) || !globalLimiter.allow('global')) {
    throw createError({ statusCode: 429, statusMessage: 'Too many link previews, slow down' })
  }
  return unfurlLink(url)
})

defineRouteMeta({
  openAPI: {
    tags: ['Chat'],
    summary: 'Unfurl a link',
    description: 'Authenticated. Returns open-graph metadata (title, description, image, site name) for an http(s) URL, for chat link previews. Private/loopback hosts are refused.',
    parameters: [{ in: 'query', name: 'url', required: true, schema: { type: 'string', format: 'uri' } }],
    responses: {
      '200': { description: 'LinkPreviewDTO (fields null when unavailable).' },
      '429': { description: 'Rate limited (too many link previews).' },
    },
  },
})
