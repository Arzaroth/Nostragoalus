import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../../../../db'
import { user } from '../../../../db/schema'
import { showcasePinSchema } from '../../../schemas/me'
import { getCabinet } from '../../../utils/achievements/cabinet'
import { resolveCompetition } from '../../../utils/competitions/store'
import { getSessionUser, isAdmin } from '../../../utils/auth-guards'
import { canViewProfile } from '../../../utils/leagues/service'
import { defineReadHandler } from '../../../utils/read-handler'

const querySchema = z.object({ competition: z.string().optional() })

const trophySchema = z.object({
  type: z.string(),
  value: z.number(),
  teamCode: z.string().nullable(),
  awardedAt: z.string(),
})
const raritySchema = z.object({ tier: z.string(), pct: z.number() })
const achievementSchema = z.object({
  key: z.string(),
  category: z.string(),
  scope: z.string(),
  icon: z.string().nullable(),
  hidden: z.boolean(),
  tiers: z.array(z.object({ tier: z.string(), threshold: z.number() })),
  earned: z
    .object({ tier: z.string().nullable(), progress: z.number(), unlockedAt: z.string() })
    .nullable(),
  current: z.number().nullable(),
  currentStreak: z.number().nullable(),
  rarity: z.array(raritySchema),
})
const responseSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  isOwner: z.boolean(),
  trophies: z.array(trophySchema),
  achievements: z.array(achievementSchema),
  showcase: z.array(showcasePinSchema),
})

export default defineReadHandler({ response: responseSchema, query: querySchema }, async ({ event, query }) => {
  const id = getRouterParam(event, 'id') as string
  const admin = await isAdmin(event)
  const viewer = await getSessionUser(event)

  const rows = await db.select({ profilePrivate: user.profilePrivate }).from(user).where(eq(user.id, id)).limit(1)
  if (rows.length === 0) throw createError({ statusCode: 404, statusMessage: 'user not found' })

  // Private profiles 404 (not 403) for everyone but league mates, admins and the
  // user themself, so probing an id never confirms the account exists.
  if (rows[0].profilePrivate) {
    const allowed = viewer && (await canViewProfile(db, { viewerId: viewer.id, targetUserId: id, isAdmin: admin }))
    if (!allowed) throw createError({ statusCode: 404, statusMessage: 'user not found' })
  }

  const competition = await resolveCompetition(db, query.competition || null)
  if (!competition) throw createError({ statusCode: 404, statusMessage: 'competition not found' })

  return getCabinet(db, { competitionId: competition.id, userId: id, viewerId: viewer?.id ?? null })
})

defineRouteMeta({
  openAPI: {
    tags: ['Achievements'],
    summary: 'A player trophy cabinet',
    description:
      "A player's trophies, achievements and pinned showcase for a competition. Global (cross-competition) badges are folded in. Hidden badges appear only once earned.",
    parameters: [
      { in: 'path', name: 'id', required: true, description: 'User id.', schema: { type: 'string' } },
      {
        in: 'query',
        name: 'competition',
        required: false,
        description: "Competition slug (e.g. 'world-cup-2026'). Defaults to the current tournament.",
        schema: { type: 'string' },
      },
    ],
    responses: {
      '200': { description: 'The cabinet (trophies, achievements, showcase).' },
      '404': { description: 'Unknown user/competition, or a private profile the caller cannot see.' },
    },
  },
})
