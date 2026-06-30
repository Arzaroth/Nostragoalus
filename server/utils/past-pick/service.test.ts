import { describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../../db/types'
import { createTestDb } from '../../../tests/db'
import { findRoundId } from '../sync/rounds'
import { makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { appendPredictionCommitment } from '../commitment/service'
import { ensureDefaultScoringConfig } from '../scoring/store'
import { DEFAULT_RULES, type ScoringRules } from '../scoring/config'
import { getPastPickCounterfactual } from './service'

// Base-only scoring (exact 3 / diff 2 / outcome 1 / miss 0): no crowd or odds
// bonus, so points follow the scoreline alone and the assertions stay exact.
const RULES: ScoringRules = { ...DEFAULT_RULES, bonusSource: 'NONE' }
const PAST = new Date('2026-06-11T00:00:00Z')

async function setup() {
  const { db, client } = await createTestDb()
  const competitionId = await seedCompetition(db)
  const roundId = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
  return { db, client, competitionId, roundId }
}

// Build a user's pick history for a match: every scoreline lands on the ledger
// (oldest first), and the LAST one becomes the kept, locked prediction.
async function seedOwnerHistory(
  db: AppDatabase,
  opts: { userId: string; matchId: string; roundId: string; history: [number, number][]; isJoker?: boolean },
): Promise<void> {
  for (const [h, a] of opts.history) {
    await appendPredictionCommitment(db, {
      predictionId: opts.userId,
      userId: opts.userId,
      matchId: opts.matchId,
      homeGoals: h,
      awayGoals: a,
    })
  }
  const [kh, ka] = opts.history[opts.history.length - 1]
  await makePrediction(db, {
    userId: opts.userId,
    matchId: opts.matchId,
    roundId: opts.roundId,
    home: kh,
    away: ka,
    isJoker: opts.isJoker ?? false,
    lockedAt: PAST,
  })
}

describe('getPastPickCounterfactual', () => {
  it('returns none before kickoff (openings stay sealed)', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const u = await makeUser(db, 'u')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'SCHEDULED' })
    await seedOwnerHistory(db, { userId: u, matchId: m, roundId, history: [[1, 0], [2, 2]] })
    expect(await getPastPickCounterfactual(db, { matchId: m, userId: u, rules: RULES })).toEqual({ scope: 'none' })
    await client.close()
  })

  it('returns none for an unknown match', async () => {
    const { db, client } = await setup()
    expect(await getPastPickCounterfactual(db, { matchId: crypto.randomUUID(), userId: 'nobody', rules: RULES })).toEqual({
      scope: 'none',
    })
    await client.close()
  })

  it('returns none when the user has no kept prediction', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const u = await makeUser(db, 'u')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 0 })
    // Ledger entry but no prediction row.
    await appendPredictionCommitment(db, { predictionId: u, userId: u, matchId: m, homeGoals: 1, awayGoals: 0 })
    expect(await getPastPickCounterfactual(db, { matchId: m, userId: u, rules: RULES })).toEqual({ scope: 'none' })
    await client.close()
  })

  it('surfaces the best earlier pick on a finished match (regret)', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const u = await makeUser(db, 'u')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 0 })
    await seedOwnerHistory(db, { userId: u, matchId: m, roundId, history: [[1, 0], [2, 2]] })
    const res = await getPastPickCounterfactual(db, { matchId: m, userId: u, rules: RULES })
    expect(res.scope).toBe('final')
    expect(res.earlier).toEqual({ home: 1, away: 0, points: 3, tier: 'EXACT' })
    expect(res.kept).toEqual({ home: 2, away: 2, points: 0, tier: 'MISS' })
    expect(res.cheeky).toBe(false)
    await client.close()
  })

  it('picks the highest-scoring earlier pick when several would have scored', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const u = await makeUser(db, 'u')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 2, fullTimeAway: 1 })
    // 1-0 (DIFF, 2) then 2-1 (EXACT, 3) then 1-1 (MISS, 0); kept 0-3 (MISS, 0).
    await seedOwnerHistory(db, { userId: u, matchId: m, roundId, history: [[1, 0], [2, 1], [1, 1], [0, 3]] })
    const res = await getPastPickCounterfactual(db, { matchId: m, userId: u, rules: RULES })
    expect(res.scope).toBe('final')
    expect(res.earlier).toEqual({ home: 2, away: 1, points: 3, tier: 'EXACT' })
    await client.close()
  })

  it('breaks ties between equal-scoring earlier picks deterministically', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const u = await makeUser(db, 'u')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 0, fullTimeAway: 0 })
    // 1-1 and 2-2 both score the draw (DIFF, 2); kept 1-0 (MISS, 0). Highest
    // scoreline wins the tie, so 2-2 is surfaced.
    await seedOwnerHistory(db, { userId: u, matchId: m, roundId, history: [[1, 1], [2, 2], [1, 0]] })
    const res = await getPastPickCounterfactual(db, { matchId: m, userId: u, rules: RULES })
    expect(res.earlier).toEqual({ home: 2, away: 2, points: 2, tier: 'DIFF' })
    expect(res.cheeky).toBe(false)
    await client.close()
  })

  it('shows the cheeky line for a winning 0-0 earlier pick and dedups repeats', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const u = await makeUser(db, 'u')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 0, fullTimeAway: 0 })
    // 3-3 then 0-0 then back to 3-3 (kept). The two 3-3 entries collapse, and the
    // kept score is never its own alternative, so the only candidate is 0-0.
    await seedOwnerHistory(db, { userId: u, matchId: m, roundId, history: [[3, 3], [0, 0], [3, 3]] })
    const res = await getPastPickCounterfactual(db, { matchId: m, userId: u, rules: RULES })
    expect(res.scope).toBe('final')
    expect(res.earlier).toEqual({ home: 0, away: 0, points: 3, tier: 'EXACT' })
    expect(res.kept).toEqual({ home: 3, away: 3, points: 2, tier: 'DIFF' })
    expect(res.cheeky).toBe(true)
    await client.close()
  })

  it('replays against the live scoreline (provisional) while in play', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const u = await makeUser(db, 'u')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'LIVE', fullTimeHome: 1, fullTimeAway: 0 })
    await seedOwnerHistory(db, { userId: u, matchId: m, roundId, history: [[1, 0], [0, 0]] })
    const res = await getPastPickCounterfactual(db, { matchId: m, userId: u, rules: RULES })
    expect(res.scope).toBe('live')
    expect(res.earlier).toEqual({ home: 1, away: 0, points: 3, tier: 'EXACT' })
    expect(res.cheeky).toBe(false)
    await client.close()
  })

  it('stays silent when the kept pick is itself exact', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const u = await makeUser(db, 'u')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 0 })
    await seedOwnerHistory(db, { userId: u, matchId: m, roundId, history: [[2, 2], [1, 0]] })
    expect(await getPastPickCounterfactual(db, { matchId: m, userId: u, rules: RULES })).toEqual({ scope: 'none' })
    await client.close()
  })

  it('stays silent when no earlier pick out-scores the kept one', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const u = await makeUser(db, 'u')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 0 })
    // kept 2-1 (DIFF, 2) beats earlier 5-0 (OUTCOME, 1).
    await seedOwnerHistory(db, { userId: u, matchId: m, roundId, history: [[5, 0], [2, 1]] })
    expect(await getPastPickCounterfactual(db, { matchId: m, userId: u, rules: RULES })).toEqual({ scope: 'none' })
    await client.close()
  })

  it('stays silent when there is no earlier pick distinct from the kept one', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const u = await makeUser(db, 'u')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 0 })
    await seedOwnerHistory(db, { userId: u, matchId: m, roundId, history: [[1, 1]] })
    expect(await getPastPickCounterfactual(db, { matchId: m, userId: u, rules: RULES })).toEqual({ scope: 'none' })
    await client.close()
  })

  it('only replays the queried user own picks (no cross-user leak)', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const a = await makeUser(db, 'a')
    const b = await makeUser(db, 'b')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 0 })
    // A regrets a 1-0 they swapped off; B never had an earlier pick.
    await seedOwnerHistory(db, { userId: a, matchId: m, roundId, history: [[1, 0], [5, 5]] })
    await seedOwnerHistory(db, { userId: b, matchId: m, roundId, history: [[2, 2]] })

    const forB = await getPastPickCounterfactual(db, { matchId: m, userId: b, rules: RULES })
    expect(forB).toEqual({ scope: 'none' })

    const forA = await getPastPickCounterfactual(db, { matchId: m, userId: a, rules: RULES })
    expect(forA.scope).toBe('final')
    expect(forA.earlier).toEqual({ home: 1, away: 0, points: 3, tier: 'EXACT' })
    await client.close()
  })

  it('applies the kept pick joker multiplier to the earlier picks too', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const u = await makeUser(db, 'u')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 0 })
    await seedOwnerHistory(db, { userId: u, matchId: m, roundId, history: [[1, 0], [2, 2]], isJoker: true })
    const res = await getPastPickCounterfactual(db, { matchId: m, userId: u, rules: RULES })
    expect(res.earlier).toEqual({ home: 1, away: 0, points: 6, tier: 'EXACT' })
    expect(res.kept).toEqual({ home: 2, away: 2, points: 0, tier: 'MISS' })
    await client.close()
  })

  it('falls back to the competition active scoring config when no rules are passed', async () => {
    const { db, client, competitionId, roundId } = await setup()
    await ensureDefaultScoringConfig(db)
    const u = await makeUser(db, 'u')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 0 })
    await seedOwnerHistory(db, { userId: u, matchId: m, roundId, history: [[1, 0], [2, 2]] })
    // Default rules use the CROWD bonus, but the field is below crowdMinDenominator
    // here, so the bonus is 0 and only base points land.
    const res = await getPastPickCounterfactual(db, { matchId: m, userId: u })
    expect(res.scope).toBe('final')
    expect(res.earlier).toEqual({ home: 1, away: 0, points: 3, tier: 'EXACT' })
    await client.close()
  })

  it('handles an ODDS scoring config (no snapshot means no odds bonus)', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const u = await makeUser(db, 'u')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 0 })
    await seedOwnerHistory(db, { userId: u, matchId: m, roundId, history: [[1, 0], [2, 2]] })
    const res = await getPastPickCounterfactual(db, { matchId: m, userId: u, rules: { ...DEFAULT_RULES, bonusSource: 'ODDS' } })
    expect(res.scope).toBe('final')
    expect(res.earlier).toEqual({ home: 1, away: 0, points: 3, tier: 'EXACT' })
    await client.close()
  })

  it('returns none when a started match has no scoreline yet', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const u = await makeUser(db, 'u')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'LIVE' })
    await seedOwnerHistory(db, { userId: u, matchId: m, roundId, history: [[1, 0], [2, 2]] })
    expect(await getPastPickCounterfactual(db, { matchId: m, userId: u, rules: RULES })).toEqual({ scope: 'none' })
    await client.close()
  })

  it('dedups a repeated non-kept earlier pick', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const u = await makeUser(db, 'u')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 0 })
    // 2-2 appears twice; only the first reaches the candidate list. kept 5-5 (MISS).
    await seedOwnerHistory(db, { userId: u, matchId: m, roundId, history: [[2, 2], [1, 0], [2, 2], [5, 5]] })
    const res = await getPastPickCounterfactual(db, { matchId: m, userId: u, rules: RULES })
    expect(res.earlier).toEqual({ home: 1, away: 0, points: 3, tier: 'EXACT' })
    await client.close()
  })

  it('scores the kept pick synthetically when it never locked', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const u = await makeUser(db, 'u')
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST, status: 'FINISHED', fullTimeHome: 1, fullTimeAway: 0 })
    await appendPredictionCommitment(db, { predictionId: u, userId: u, matchId: m, homeGoals: 1, awayGoals: 0 })
    await appendPredictionCommitment(db, { predictionId: u, userId: u, matchId: m, homeGoals: 2, awayGoals: 2 })
    // Kept pick present but never locked: it is not in the field, so it is scored
    // via the synthetic fallback.
    await makePrediction(db, { userId: u, matchId: m, roundId, home: 2, away: 2, lockedAt: null })
    const res = await getPastPickCounterfactual(db, { matchId: m, userId: u, rules: RULES })
    expect(res.scope).toBe('final')
    expect(res.earlier).toEqual({ home: 1, away: 0, points: 3, tier: 'EXACT' })
    expect(res.kept).toEqual({ home: 2, away: 2, points: 0, tier: 'MISS' })
    await client.close()
  })
})
