import { z } from 'zod'
import { db } from '../../../../../db'
import { resolveLeagueManage } from '../../../../utils/leagues/service'
import { getRewardWinnersExport } from '../../../../utils/rewards/service'
import { createRateLimiter } from '../../../../utils/rate-limit'
import { defineReadHandler } from '../../../../utils/read-handler'
import { rewardCriterionSchema, rewardMetricSchema } from '../../../../schemas/league'

const responseSchema = z.object({
  leagueName: z.string(),
  rows: z.array(
    z.object({
      type: rewardCriterionSchema,
      prizeLabel: z.string(),
      teamCode: z.string().nullable(),
      metric: rewardMetricSchema,
      userId: z.string(),
      displayName: z.string(),
      email: z.string(),
      value: z.number(),
    }),
  ),
})

// A manager exports a handful of times a season, so a low ceiling costs nothing
// legitimate and turns a stolen owner session from a standing PII feed (poll as the
// leaderboard moves) into a slow one.
const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 })

export default defineReadHandler({ response: responseSchema, auth: 'user' }, async ({ event, user }) => {
  const id = getRouterParam(event, 'id')!
  // Owner/moderator of this league only - no site-admin bypass, unlike the reward
  // reads: this is the one payload carrying member emails, so it stays with the
  // people running the league's prizes.
  await resolveLeagueManage(db, id, user.id)
  if (!limiter.allow(user.id)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many exports, try again in a minute' })
  }
  // The one response in the app carrying other people's email addresses: pin
  // no-store here rather than trust that no future route rule or CDN caches /api/**.
  setHeader(event, 'Cache-Control', 'no-store')
  return await getRewardWinnersExport(db, id, user.id)
})

defineRouteMeta({
  openAPI: {
    tags: ['Leagues'],
    summary: 'Export the prize winners',
    description:
      "Owner/moderator only. The current holder(s) of each configured prize with the email needed to hand it over. Live/provisional until the competition ends. A holder the caller may not identify (admin-hidden, or a private profile) comes back with a blank name and email. Rate-limited; never cached.",
    responses: {
      '200': { description: 'The prize winners.' },
      '401': { description: 'Not signed in.' },
      '403': { description: 'Not an owner or moderator.' },
      '404': { description: 'Unknown league, or a league the caller is not in.' },
      '429': { description: 'Too many exports.' },
    },
  },
})
