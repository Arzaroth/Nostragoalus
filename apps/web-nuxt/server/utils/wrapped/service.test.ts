import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../../db/types'
import {
  bestScorerPick,
  championPick,
  chatMessage,
  chatMessageReaction,
  competitionAward,
  match,
  prediction,
  round,
  user,
  userAchievement,
} from '../../../db/schema'
import type { BaseTier } from '../scoring/tiers'
import { createTestDb } from '../../../tests/db'
import { addLeagueMember, makeLeague, makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { NotFoundError } from '../errors'
import { getWrapped } from './service'
import type { WrappedDto } from '#shared/types/wrapped'

let db: AppDatabase

beforeEach(async () => {
  db = (await createTestDb()).db as unknown as AppDatabase
})

async function roundId(competitionId: string, stage: string, matchday: number | null = null): Promise<string> {
  const rows = await db.select().from(round).where(eq(round.competitionId, competitionId))
  const r = rows.find((x) => x.stage === stage && (matchday === null || x.matchday === matchday))
  if (!r) throw new Error(`round ${stage}/${matchday} not seeded`)
  return r.id
}

async function scoredMatch(
  competitionId: string,
  rid: string,
  stage: string,
  kickoff: Date,
  over: { home?: number; away?: number; homeTeam?: string; awayTeam?: string } = {},
): Promise<string> {
  const id = await makeMatch(db, {
    competitionId,
    roundId: rid,
    stage: stage as never,
    status: 'FINISHED',
    fullTimeHome: over.home ?? 1,
    fullTimeAway: over.away ?? 0,
    winner: (over.home ?? 1) > (over.away ?? 0) ? 'HOME' : (over.home ?? 1) < (over.away ?? 0) ? 'AWAY' : 'DRAW',
    kickoffTime: kickoff,
    homeTeam: over.homeTeam ?? 'Home',
    awayTeam: over.awayTeam ?? 'Away',
  })
  await db.update(match).set({ scoringState: 'SCORED' }).where(eq(match.id, id))
  return id
}

interface PredOpts {
  userId: string
  matchId: string
  roundId: string
  tier?: BaseTier | null
  points?: number
  bonus?: number
  bonusSource?: 'CROWD' | 'ODDS'
  crowdShare?: string
  isJoker?: boolean
  home?: number
  away?: number
}
async function pred(o: PredOpts): Promise<string> {
  const id = await makePrediction(db, {
    userId: o.userId,
    matchId: o.matchId,
    roundId: o.roundId,
    home: o.home ?? 0,
    away: o.away ?? 0,
    isJoker: o.isJoker ?? false,
  })
  await db
    .update(prediction)
    .set({
      baseTier: o.tier ?? null,
      totalPoints: o.tier != null ? (o.points ?? 0) : null,
      basePoints: o.tier != null ? (o.points ?? 0) - (o.bonus ?? 0) : null,
      bonusPoints: o.bonus ?? 0,
      bonusSource: o.bonus ? (o.bonusSource ?? 'CROWD') : null,
      crowdShare: o.crowdShare ?? null,
      scoredAt: o.tier != null ? new Date() : null,
    })
    .where(eq(prediction.id, id))
  return id
}

// A decided FINAL flips the wrapped gate open.
async function decideFinal(competitionId: string): Promise<void> {
  const fr = await roundId(competitionId, 'FINAL')
  await scoredMatch(competitionId, fr, 'FINAL', new Date('2026-07-19T18:00:00Z'))
}

describe('getWrapped', () => {
  it('throws on an unknown competition and an unknown user', async () => {
    await expect(getWrapped(db, { competitionId: 'nope', userId: 'nope' })).rejects.toBeInstanceOf(NotFoundError)
    const c = await seedCompetition(db)
    await decideFinal(c)
    await expect(getWrapped(db, { competitionId: c, userId: 'ghost' })).rejects.toBeInstanceOf(NotFoundError)
  })

  it('returns the teaser before the final is decided', async () => {
    const c = await seedCompetition(db, { name: 'Teaser Cup' })
    await makeUser(db, 'alice')
    const res = await getWrapped(db, { competitionId: c, userId: 'alice' })
    expect(res).toEqual({ ready: false, competitionName: 'Teaser Cup' })
  })

  it('stays a teaser when the final is decided but not yet scored', async () => {
    const c = await seedCompetition(db, { name: 'Window Cup' })
    await makeUser(db, 'alice')
    const fr = await roundId(c, 'FINAL')
    // Final whistle blown (winner set by sync) but finalize has not scored it
    // yet: the recap must not unlock with zeroed bonuses and an empty haul.
    await makeMatch(db, {
      competitionId: c,
      roundId: fr,
      stage: 'FINAL' as never,
      status: 'FINISHED',
      fullTimeHome: 1,
      fullTimeAway: 0,
      winner: 'HOME',
      kickoffTime: new Date('2026-07-19T18:00:00Z'),
      homeTeam: 'Home',
      awayTeam: 'Away',
    })
    const res = await getWrapped(db, { competitionId: c, userId: 'alice' })
    expect(res).toEqual({ ready: false, competitionName: 'Window Cup' })
  })

  it('builds the full recap for a scored competition', async () => {
    const c = await seedCompetition(db, { name: 'Recap Cup' })
    const g1 = await roundId(c, 'GROUP', 1)
    const g2 = await roundId(c, 'GROUP', 2)
    const alice = await makeUser(db, 'alice')
    const bob = await makeUser(db, 'bob')

    const m1 = await scoredMatch(c, g1, 'GROUP', new Date('2026-06-11T12:00:00Z'), { homeTeam: 'France', awayTeam: 'Peru' })
    const m2 = await scoredMatch(c, g1, 'GROUP', new Date('2026-06-11T15:00:00Z'))
    const m3 = await scoredMatch(c, g2, 'GROUP', new Date('2026-06-15T12:00:00Z'))

    // Alice: joker EXACT with crowd bonus on m1, MISS on m2 (bob nails it), DIFF on m3.
    await pred({ userId: alice, matchId: m1, roundId: g1, tier: 'EXACT', points: 8, bonus: 2, crowdShare: '0.12500', isJoker: true, home: 1, away: 0 })
    await pred({ userId: alice, matchId: m2, roundId: g1, tier: 'MISS', points: 0, home: 3, away: 3 })
    await pred({ userId: alice, matchId: m3, roundId: g2, tier: 'DIFF', points: 2, home: 2, away: 1 })
    // Bob: EXACT on m2 (the field got what alice missed), MISS on m1.
    await pred({ userId: bob, matchId: m2, roundId: g1, tier: 'EXACT', points: 3, home: 1, away: 0 })
    await pred({ userId: bob, matchId: m1, roundId: g1, tier: 'MISS', points: 0, home: 0, away: 2 })

    await db.insert(championPick).values({ userId: alice, competitionId: c, teamCode: 'FRA', teamName: 'France', awardedPoints: 10 })
    await db.insert(bestScorerPick).values({ userId: alice, competitionId: c, playerId: 'p1', playerName: 'K. Mbappe', teamCode: 'FRA', teamName: 'France', awardedPoints: 0 })
    await db.insert(competitionAward).values({ userId: alice, competitionId: c, type: 'MADAME_IRMA', value: 1, teamCode: null })
    await db.insert(userAchievement).values({ userId: alice, competitionId: c, key: 'first-blood', tier: 'GOLD', progress: 1 })
    await db.insert(userAchievement).values({ userId: alice, competitionId: null, key: 'the-magic-word', tier: 'BRONZE', progress: 1 })

    // Chat: one league in this competition; alice sends 2 messages (1 removed),
    // reacts twice FIRE once GOAL, bob reacts to alice once; alice's own reaction
    // to her message must not count as received.
    const lg = await makeLeague(db, { competitionId: c, ownerId: alice })
    await addLeagueMember(db, lg, bob)
    const [msg1] = await db.insert(chatMessage).values({ leagueId: lg, userId: alice, epoch: 1, ciphertext: 'x' }).returning({ id: chatMessage.id })
    const [msg2] = await db.insert(chatMessage).values({ leagueId: lg, userId: alice, epoch: 1, ciphertext: 'y', moderationState: 'REMOVED' }).returning({ id: chatMessage.id })
    const [bobMsg] = await db.insert(chatMessage).values({ leagueId: lg, userId: bob, epoch: 1, ciphertext: 'z' }).returning({ id: chatMessage.id })
    await db.insert(chatMessageReaction).values({ userId: alice, messageId: bobMsg.id, emoji: 'FIRE' })
    await db.insert(chatMessageReaction).values({ userId: alice, messageId: msg2.id, emoji: 'FIRE' })
    await db.insert(chatMessageReaction).values({ userId: alice, messageId: msg1.id, emoji: 'GOAL' })
    await db.insert(chatMessageReaction).values({ userId: bob, messageId: msg1.id, emoji: 'WOW' })

    await decideFinal(c)

    const res = (await getWrapped(db, { competitionId: c, userId: alice })) as WrappedDto
    expect(res.ready).toBe(true)
    expect(res.competitionName).toBe('Recap Cup')
    expect(res.displayName).toBe('alice')

    // 10 prediction points + 10 champion bonus; alice ranks 1 of 2.
    expect(res.totals).toMatchObject({
      totalPoints: 20,
      predictionPoints: 10,
      championPoints: 10,
      bestScorerPoints: 0,
      rank: 1,
      players: 2,
      topPercent: 50,
    })

    expect(res.tiers).toMatchObject({ exact: 1, diff: 1, outcome: 0, miss: 1, predictions: 3 })
    // 4 scored matches (3 group + the final), alice predicted 3 of them.
    expect(res.tiers.scoredMatches).toBe(4)
    expect(res.tiers.completionPct).toBe(75)

    expect(res.bestPick).toMatchObject({ homeTeam: 'France', totalPoints: 8, isJoker: true, tier: 'EXACT', crowdSharePct: 13 })
    // m2 is the one that got away: bob (100% of the field's exacts) nailed it.
    expect(res.biggestMiss).toMatchObject({ matchId: m2, fieldExactPct: 50 })

    expect(res.jokers).toMatchObject({ played: 1, points: 8 })
    expect(res.jokers.best).toMatchObject({ matchId: m1 })

    expect(res.crowd).toMatchObject({ bonusPoints: 2, loneWolf: 1 })
    expect(res.crowd.biggestBonus).toMatchObject({ matchId: m1, bonusPoints: 2 })

    expect(res.streaks.exactStreak).toBe(1)
    expect(res.streaks.scoringStreak).toBe(1)

    expect(res.meta.champion).toEqual({ teamCode: 'FRA', teamName: 'France', points: 10, hit: true })
    expect(res.meta.bestScorer).toEqual({ playerName: 'K. Mbappe', teamCode: 'FRA', points: 0, hit: false })

    expect(res.chat).toEqual({ messages: 1, reactionsGiven: 3, reactionsReceived: 1, topEmoji: 'FIRE' })

    expect(res.haul.trophies).toEqual([{ type: 'MADAME_IRMA', value: 1, teamCode: null }])
    expect(res.haul.badges).toEqual(
      expect.arrayContaining([
        { key: 'first-blood', tier: 'GOLD' },
        { key: 'the-magic-word', tier: 'BRONZE' },
      ]),
    )

    // Journey: after G1 alice leads (8 vs 3); after G2 she extends (10).
    expect(res.journey).toHaveLength(2)
    expect(res.journey[0]).toMatchObject({ rank: 1, players: 2, points: 8 })
    expect(res.journey[1]).toMatchObject({ rank: 1, players: 2, points: 10 })
  })

  it('nulls the empty surfaces for a user with no activity', async () => {
    const c = await seedCompetition(db)
    await makeUser(db, 'lurker')
    await decideFinal(c)
    const res = (await getWrapped(db, { competitionId: c, userId: 'lurker' })) as WrappedDto
    expect(res.ready).toBe(true)
    expect(res.bestPick).toBeNull()
    expect(res.biggestMiss).toBeNull()
    expect(res.jokers).toEqual({ played: 0, points: 0, best: null })
    expect(res.crowd).toEqual({ bonusPoints: 0, biggestBonus: null, loneWolf: 0 })
    expect(res.meta).toEqual({ champion: null, bestScorer: null })
    expect(res.chat).toEqual({ messages: 0, reactionsGiven: 0, reactionsReceived: 0, topEmoji: null })
    expect(res.haul).toEqual({ trophies: [], badges: [] })
    expect(res.journey).toEqual([])
    expect(res.tiers.predictions).toBe(0)
  })

  it('skips biggestMiss when nobody nailed the missed match', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const alice = await makeUser(db, 'alice')
    const m1 = await scoredMatch(c, g1, 'GROUP', new Date('2026-06-11T12:00:00Z'))
    await pred({ userId: alice, matchId: m1, roundId: g1, tier: 'MISS', points: 0 })
    await decideFinal(c)
    const res = (await getWrapped(db, { competitionId: c, userId: alice })) as WrappedDto
    expect(res.biggestMiss).toBeNull()
  })

  it('breaks ties deterministically and ignores odds bonuses', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const g2 = await roundId(c, 'GROUP', 2)
    const g3 = await roundId(c, 'GROUP', 3)
    const r32 = await roundId(c, 'R32')
    const alice = await makeUser(db, 'alice')
    const bob = await makeUser(db, 'bob')
    const carol = await makeUser(db, 'carol')

    const t0 = new Date('2026-06-10T12:00:00Z')
    const t1 = new Date('2026-06-12T12:00:00Z')
    const t2 = new Date('2026-06-14T12:00:00Z')
    const t3 = new Date('2026-06-28T12:00:00Z')

    // MD1: alice absent; bob and carol both MISS (level on the whole ladder).
    const mBob = await scoredMatch(c, g1, 'GROUP', t0)
    await pred({ userId: bob, matchId: mBob, roundId: g1, tier: 'MISS', points: 0 })
    await pred({ userId: carol, matchId: mBob, roundId: g1, tier: 'MISS', points: 0 })

    // MD2: two equal EXACTs at the same kickoff, both with an equal crowd bonus.
    const mA = await scoredMatch(c, g2, 'GROUP', t1)
    const mB = await scoredMatch(c, g2, 'GROUP', t1)
    await pred({ userId: alice, matchId: mA, roundId: g2, tier: 'EXACT', points: 4, bonus: 2, isJoker: true })
    await pred({ userId: alice, matchId: mB, roundId: g2, tier: 'EXACT', points: 4, bonus: 2 })

    // MD3: a second joker on equal points (later kickoff) with an ODDS bonus,
    // plus a scored row with a null tier and null bonus.
    const mC = await scoredMatch(c, g3, 'GROUP', t2)
    await pred({ userId: alice, matchId: mC, roundId: g3, tier: 'EXACT', points: 4, bonus: 5, bonusSource: 'ODDS', isJoker: true })
    const mNull = await scoredMatch(c, g3, 'GROUP', t2)
    const nullPredId = await pred({ userId: alice, matchId: mNull, roundId: g3, tier: 'DIFF', points: 1 })
    // Null tier + a CROWD source with null bonus: legacy/partial-rescore shape.
    await db.update(prediction).set({ baseTier: null, bonusPoints: null, bonusSource: 'CROWD' }).where(eq(prediction.id, nullPredId))
    // carol's lone OUTCOME keeps the outcome arm of the journey ladder alive.
    await pred({ userId: carol, matchId: mNull, roundId: g3, tier: 'OUTCOME', points: 1 })

    // R32: two same-kickoff misses that the field (bob) nailed equally.
    const mD = await scoredMatch(c, r32, 'R32', t3)
    const mE = await scoredMatch(c, r32, 'R32', t3)
    await pred({ userId: alice, matchId: mD, roundId: r32, tier: 'MISS', points: 0 })
    await pred({ userId: alice, matchId: mE, roundId: r32, tier: 'MISS', points: 0 })
    await pred({ userId: bob, matchId: mD, roundId: r32, tier: 'EXACT', points: 3 })
    await pred({ userId: bob, matchId: mE, roundId: r32, tier: 'EXACT', points: 3 })

    await decideFinal(c)
    const res = (await getWrapped(db, { competitionId: c, userId: alice })) as WrappedDto

    // Equal points + equal kickoff resolve on matchId; equal points across
    // kickoffs resolve to the earlier one.
    const firstAB = [mA, mB].sort()[0]
    expect(res.bestPick!.matchId).toBe(firstAB)
    expect(res.jokers.best!.matchId).toBe(mA)
    expect(res.jokers.played).toBe(2)

    // The ODDS bonus is excluded from the crowd slide entirely.
    expect(res.crowd.bonusPoints).toBe(4)
    expect(res.crowd.biggestBonus!.matchId).toBe(firstAB)
    expect(res.crowd.biggestBonus!.bonusPoints).toBe(2)

    // Both misses were equally gettable: the earliest matchId wins.
    expect(res.biggestMiss!.matchId).toBe([mD, mE].sort()[0])
    expect(res.biggestMiss!.fieldExactPct).toBe(50)

    // Alice has no MD1 pick, so her journey starts at MD2 (3 rounds, not 4).
    expect(res.journey).toHaveLength(3)
    expect(res.journey[0]!.players).toBe(3)
    expect(res.journey[0]!.rank).toBe(1)

    // A featured pick scored before bonuses existed (null bonusPoints) reads 0.
    const bobRes = (await getWrapped(db, { competitionId: c, userId: bob })) as WrappedDto
    expect(bobRes.bestPick!.totalPoints).toBe(3)
    const bobBestId = bobRes.bestPick!.matchId
    await db.update(prediction).set({ bonusPoints: null }).where(eq(prediction.matchId, bobBestId))
    const bobAgain = (await getWrapped(db, { competitionId: c, userId: bob })) as WrappedDto
    expect(bobAgain.bestPick!.bonusPoints).toBe(0)
  })

  it('hides rank and shrinks the population for a hidden user, keeping their points', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const alice = await makeUser(db, 'alice')
    const bob = await makeUser(db, 'bob')
    await db.update(user).set({ hiddenFromLeaderboard: true }).where(eq(user.id, alice))
    const m1 = await scoredMatch(c, g1, 'GROUP', new Date('2026-06-11T12:00:00Z'))
    await pred({ userId: alice, matchId: m1, roundId: g1, tier: 'EXACT', points: 3 })
    await pred({ userId: bob, matchId: m1, roundId: g1, tier: 'OUTCOME', points: 1 })
    await decideFinal(c)
    const res = (await getWrapped(db, { competitionId: c, userId: alice })) as WrappedDto
    expect(res.totals.rank).toBeNull()
    expect(res.totals.topPercent).toBeNull()
    expect(res.totals.players).toBe(1)
    expect(res.totals.totalPoints).toBe(3)
    // The journey still replays: a hidden user sees their own private timeline.
    expect(res.journey).toHaveLength(1)
  })
})
