import { z } from 'zod'

// Response shapes shared by 2+ routes in the contract-parity pass (roadmap, feed
// and share). Lives under server/schemas (out of the coverage gate) so the thin
// route files stay uncovered by design; the handler-return typecheck (see
// server/utils/validated-handler.ts) proves each route still matches its schema.

// Signed calendar-feed subscription URLs (https + webcal). Returned by both
// feed/subscription.get and feed/regenerate.post.
export const feedUrlsSchema = z.object({
  url: z.string(),
  webcalUrl: z.string(),
})

// A minted share link: the signed, stateless token plus its landing-page and OG
// image URLs. Returned by share/profile-mint.post and share/analytics-mint.post.
export const shareLinksSchema = z.object({
  token: z.string(),
  url: z.string(),
  imageUrl: z.string(),
})
