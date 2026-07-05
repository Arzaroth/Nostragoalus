import { and, eq } from 'drizzle-orm'
import { db } from '../../../../db'
import { bestScorerPick, championPick, chatIdentity, user } from '../../../../db/schema'
import { getUserPublicPredictions } from '../../../utils/predictions/service'
import { resolveCompetition } from '../../../utils/competitions/store'
import { getSessionUser, isAdmin } from '../../../utils/auth-guards'
import { canViewProfile } from '../../../utils/leagues/service'
import { canDm } from '../../../utils/dm/service'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
  const admin = await isAdmin(event)
  const viewer = await getSessionUser(event)
  const rows = await db
    .select({ name: user.name, image: user.image, profilePrivate: user.profilePrivate })
    .from(user)
    .where(eq(user.id, id))
    .limit(1)
  if (rows.length === 0) throw createError({ statusCode: 404, statusMessage: 'user not found' })

  // Private profiles 404 (not 403) for everyone but league mates, admins and
  // the user themself, so probing an id never confirms the account exists.
  if (rows[0].profilePrivate) {
    const allowed = viewer && (await canViewProfile(db, { viewerId: viewer.id, targetUserId: id, isAdmin: admin }))
    if (!allowed) throw createError({ statusCode: 404, statusMessage: 'user not found' })
  }

  // 'global' shows the player across every competition
  const requested = (getQuery(event).competition as string) || null
  const global = requested === 'global'
  const competition = global ? null : await resolveCompetition(db, requested)

  const championRows = await db
    .select({ teamCode: championPick.teamCode, teamName: championPick.teamName, competitionId: championPick.competitionId, awardedPoints: championPick.awardedPoints })
    .from(championPick)
    .where(
      competition
        ? and(eq(championPick.userId, id), eq(championPick.competitionId, competition.id))
        : eq(championPick.userId, id),
    )
  const champion = competition ? (championRows[0] ?? null) : null

  const bestScorerRows = competition
    ? await db
        .select({ teamCode: bestScorerPick.teamCode, teamName: bestScorerPick.teamName, playerName: bestScorerPick.playerName, awardedPoints: bestScorerPick.awardedPoints })
        .from(bestScorerPick)
        .where(and(eq(bestScorerPick.userId, id), eq(bestScorerPick.competitionId, competition.id)))
        .limit(1)
    : []
  const bestScorer = bestScorerRows[0] ?? null

  // A user can only be DMed once they have set up chat (a chat_identity holds their
  // public key; DMs are sealed to it) AND the viewer is allowed to reach them (a
  // shared league or the target opted into discovery). Surfaced so the profile only
  // shows "Message" when clicking it will actually open a thread - matching the
  // server-side canDm gate on identity.get and createThread.
  const identityRows = await db.select({ userId: chatIdentity.userId }).from(chatIdentity).where(eq(chatIdentity.userId, id)).limit(1)
  const canMessage = identityRows.length > 0 && !!viewer && (await canDm(db, viewer.id, id))

  return {
    user: { id, name: rows[0].name, image: rows[0].image, canMessage },
    champion,
    bestScorer,
    champions: global ? championRows : undefined,
    global,
    // Admins see picks for matches that haven't kicked off yet; the client
    // draws a divider before those rows.
    adminView: admin,
    predictions: await getUserPublicPredictions(db, id, new Date(), competition?.id, admin),
  }
})

defineRouteMeta({
  openAPI: {
    "tags": [
      "Users"
    ],
    "summary": "A player's picks",
    "description": "Another player's predictions - only for matches that have kicked off (pending picks stay private).",
    "parameters": [
      {
        "in": "path",
        "name": "id",
        "required": true,
        "description": "User id.",
        "schema": {
          "type": "string"
        }
      },
      {
        "in": "query",
        "name": "competition",
        "required": false,
        "description": "Competition slug (e.g. 'world-cup-2026'). Defaults to the current tournament.",
        "schema": {
          "type": "string"
        }
      }
    ],
    "responses": {
      "200": {
        "description": "Locked predictions with points."
      },
      "404": {
        "description": "Unknown user, or a private profile the caller does not share a league with (admins and the user themself always pass)."
      }
    }
  },
})
