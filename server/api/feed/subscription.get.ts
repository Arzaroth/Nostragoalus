import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../../db'
import { user as userTable } from '../../../db/schema'
import { feedUrlsSchema } from '../../schemas/roadmap'
import { FEED_LOCALES, type FeedLocale, signFeedToken } from '../../utils/feed/token'
import { defineReadHandler } from '../../utils/read-handler'

// Tolerant: an unknown locale falls back to 'en' rather than 422ing.
const querySchema = z.object({ locale: z.string().optional() })

// Returns the caller's own calendar-feed subscription URLs. The token is
// deterministic (same user + locale -> same token), so this is idempotent and the
// URL is stable for a calendar client to keep polling. Locale defaults to English;
// the client passes its active locale so the feed's event text matches the UI.
export default defineReadHandler({ response: feedUrlsSchema, auth: 'user', query: querySchema }, async ({ event, user, query }) => {
  const locale = (
    query.locale && (FEED_LOCALES as readonly string[]).includes(query.locale) ? query.locale : 'en'
  ) as FeedLocale

  const secret = useRuntimeConfig(event).betterAuthSecret
  const [row] = await db.select({ fv: userTable.feedTokenVersion }).from(userTable).where(eq(userTable.id, user.id))
  const token = signFeedToken(secret, { u: user.id, l: locale, fv: row?.fv ?? 0, v: 1 })
  const origin = getRequestURL(event).origin
  const url = `${origin}/api/feed/calendar.ics?token=${token}`
  // webcal:// makes desktop/mobile calendar apps offer a one-tap subscribe.
  const webcalUrl = url.replace(/^https?:/, 'webcal:')
  return { url, webcalUrl }
})

defineRouteMeta({
  openAPI: {
    tags: ['Feed'],
    summary: 'My calendar feed URL',
    description:
      "Mints the signed subscription URL (https + webcal) for the authenticated user's iCalendar feed of fixtures and pick deadlines. Deterministic per user + locale.",
    parameters: [{ name: 'locale', in: 'query', required: false, schema: { type: 'string', enum: ['en', 'fr', 'th', 'tlh', 'ar'] } }],
    responses: {
      '200': { description: 'The https and webcal subscription URLs.' },
      '401': { description: 'Not signed in.' },
    },
  },
})
