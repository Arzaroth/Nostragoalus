import { getRequestURL } from 'h3'
import { requireUser } from '../../utils/auth-guards'
import { FEED_LOCALES, type FeedLocale, signFeedToken } from '../../utils/feed/token'

// Returns the caller's own calendar-feed subscription URLs. The token is
// deterministic (same user + locale -> same token), so this is idempotent and the
// URL is stable for a calendar client to keep polling. Locale defaults to English;
// the client passes its active locale so the feed's event text matches the UI.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const q = getQuery(event)
  const locale = (
    typeof q.locale === 'string' && (FEED_LOCALES as readonly string[]).includes(q.locale) ? q.locale : 'en'
  ) as FeedLocale

  const secret = useRuntimeConfig(event).betterAuthSecret
  const token = signFeedToken(secret, { u: user.id, l: locale, v: 1 })
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
