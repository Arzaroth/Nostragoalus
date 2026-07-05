import { getRequestURL } from 'h3'
import { eq, sql } from 'drizzle-orm'
import { db } from '../../../db'
import { user as userTable } from '../../../db/schema'
import { FEED_LOCALES, type FeedLocale, signFeedToken } from '../../utils/feed/token'
import { defineValidatedHandler } from '../../utils/validated-handler'

// Revoke every previously-issued calendar-feed URL for the caller by bumping their
// feed-token version, then mint a fresh subscription URL. Use when a feed link
// leaked (calendar URLs get logged/synced/shared). No body; session + same-origin
// gated by defineValidatedHandler.
export default defineValidatedHandler({}, async ({ user, event }) => {
  const q = getQuery(event)
  const locale = (
    typeof q.locale === 'string' && (FEED_LOCALES as readonly string[]).includes(q.locale) ? q.locale : 'en'
  ) as FeedLocale

  const [row] = await db
    .update(userTable)
    .set({ feedTokenVersion: sql`${userTable.feedTokenVersion} + 1` })
    .where(eq(userTable.id, user.id))
    .returning({ fv: userTable.feedTokenVersion })

  const secret = useRuntimeConfig(event).betterAuthSecret
  const token = signFeedToken(secret, { u: user.id, l: locale, fv: row?.fv ?? 0, v: 1 })
  const origin = getRequestURL(event).origin
  const url = `${origin}/api/feed/calendar.ics?token=${token}`
  const webcalUrl = url.replace(/^https?:/, 'webcal:')
  return { url, webcalUrl }
})

defineRouteMeta({
  openAPI: {
    tags: ['Feed'],
    summary: 'Regenerate my calendar feed link',
    description:
      "Bumps the caller's feed-token version, revoking every previously-issued calendar URL, and returns a fresh subscription URL (https + webcal). Use if a feed link leaked.",
    parameters: [{ name: 'locale', in: 'query', required: false, schema: { type: 'string', enum: ['en', 'fr', 'th', 'tlh', 'ar'] } }],
    responses: {
      '200': { description: 'The new https and webcal subscription URLs.' },
      '401': { description: 'Not signed in.' },
    },
  },
})
