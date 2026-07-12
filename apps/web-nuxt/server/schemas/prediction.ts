import { createSelectSchema } from 'drizzle-zod'
import { z } from 'zod'
import { match, prediction, round } from '../../db/schema'

// Shared response schemas for prediction-shaped payloads. Derived from the
// drizzle tables (drizzle-zod) so the field types + nullability track the schema
// exactly - a column change flows here, and the handler-return typecheck (see
// server/utils/validated-handler.ts) proves each route still matches. Lives
// under server/schemas (not server/utils) so it is out of the coverage gate;
// route files are thin and uncovered by design.
const predCols = createSelectSchema(prediction)
const matchCols = createSelectSchema(match)
const roundCols = createSelectSchema(round)

// One row of `predictionView` (server/utils/predictions/service.ts): a
// prediction joined to its match + round, as returned by getMyPredictions.
export const predictionViewSchema = z.object({
  ...predCols.pick({
    id: true,
    userId: true,
    matchId: true,
    roundId: true,
    homeGoals: true,
    awayGoals: true,
    isOutcomeOnly: true,
    wager: true,
    isJoker: true,
    baseTier: true,
    totalPoints: true,
    basePoints: true,
    bonusPoints: true,
    crowdShare: true,
    jokerMultiplierApplied: true,
  }).shape,
  ...matchCols.pick({
    homeTeam: true,
    awayTeam: true,
    homeTeamCode: true,
    awayTeamCode: true,
    kickoffTime: true,
    status: true,
    stage: true,
    fullTimeHome: true,
    fullTimeAway: true,
    penaltiesHome: true,
    penaltiesAway: true,
  }).shape,
  roundLabel: roundCols.shape.label,
  roundSort: roundCols.shape.sortOrder,
})

// One match's summed crowd prediction (getCrowdTotals / getMatchCrowdTotal).
export const crowdTotalSchema = z.object({
  home: z.number(),
  away: z.number(),
  count: z.number(),
})
