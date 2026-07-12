import { getRequestURL } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '../../../db'
import { user as userTable } from '../../../db/schema'
import { buildFeedCalendar } from '../../utils/feed/ical'
import { getFeedMatches } from '../../utils/feed/service'
import { verifyFeedToken } from '../../utils/feed/token'

// Public, token-authenticated iCalendar feed. No session: the signed token IS the
// capability (it names the user), so a calendar client with no cookies can poll
// it. Leak-safe - the .ics carries fixtures, results and a predicted/not flag, but
// never the user's predicted score.
export default defineEventHandler(async (event) => {
  const token = getQuery(event).token
  const secret = useRuntimeConfig(event).betterAuthSecret
  const payload = verifyFeedToken(secret, typeof token === 'string' ? token : undefined)
  if (!payload) throw createError({ statusCode: 404, statusMessage: 'feed not found' })

  // Per-user revocation: a token minted before the user regenerated their feed
  // link carries a stale version and is rejected (same 404 as an unknown token,
  // so a revoked URL never confirms the user exists).
  const [owner] = await db.select({ fv: userTable.feedTokenVersion }).from(userTable).where(eq(userTable.id, payload.u))
  // Absent `fv` (a token minted before feed-token versioning) counts as version 0,
  // the user's default, so pre-existing calendar subscriptions keep working until a
  // regenerate bumps the version and orphans them.
  if (!owner || owner.fv !== (payload.fv ?? 0)) throw createError({ statusCode: 404, statusMessage: 'feed not found' })

  const now = new Date()
  const matches = await getFeedMatches(db, payload.u, now)
  const origin = getRequestURL(event).origin
  const ics = buildFeedCalendar(matches, { origin, locale: payload.l, now })

  setHeader(event, 'content-type', 'text/calendar; charset=utf-8')
  setHeader(event, 'content-disposition', 'inline; filename="nostragoalus.ics"')
  // A calendar client re-polls on its own cadence; keep it private and briefly
  // cacheable so a tight client doesn't hammer the DB.
  setHeader(event, 'cache-control', 'private, max-age=300')
  return ics
})

defineRouteMeta({
  openAPI: {
    tags: ['Feed'],
    summary: 'iCalendar feed',
    description:
      'Returns an iCalendar (.ics) feed of fixtures and pick deadlines for the user named by the signed token. Public and session-less: the token is the capability. Never exposes a predicted score - only the public scoreline once played and whether the user has predicted. 404 on an unknown or invalid token.',
    parameters: [{ name: 'token', in: 'query', required: true, schema: { type: 'string' } }],
    responses: {
      '200': { description: 'The iCalendar document (text/calendar).' },
      '404': { description: 'Unknown or invalid feed token.' },
    },
  },
})
