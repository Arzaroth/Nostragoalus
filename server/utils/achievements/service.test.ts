import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../../db/types'
import {
  bestScorerPick,
  championPick,
  competitionAward,
  match,
  prediction,
  round,
  userAchievement,
} from '../../../db/schema'
import type { BaseTier } from '../scoring/tiers'
import { createTestDb } from '../../../tests/db'
import { makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { computeAchievementStats, evaluateAchievements, grantAchievement } from './service'

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

async function scoredMatch(competitionId: string, rid: string, stage: string, kickoff: Date): Promise<string> {
  const id = await makeMatch(db, {
    competitionId,
    roundId: rid,
    stage: stage as never,
    status: 'FINISHED',
    fullTimeHome: 1,
    fullTimeAway: 0,
    winner: 'HOME',
    kickoffTime: kickoff,
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
  isJoker?: boolean
  createdAt?: Date
}
async function pred(o: PredOpts): Promise<string> {
  const id = await makePrediction(db, {
    userId: o.userId,
    matchId: o.matchId,
    roundId: o.roundId,
    home: 0,
    away: 0,
    isJoker: o.isJoker ?? false,
  })
  await db
    .update(prediction)
    .set({
      baseTier: o.tier ?? null,
      totalPoints: o.points ?? (o.tier ? 0 : null),
      basePoints: o.points ?? null,
      bonusPoints: o.bonus ?? 0,
      scoredAt: o.tier ? new Date() : null,
      ...(o.createdAt ? { createdAt: o.createdAt } : {}),
    })
    .where(eq(prediction.id, id))
  return id
}

const stats = async (competitionId: string, userId: string) =>
  (await computeAchievementStats(db, competitionId)).get(userId)!

describe('computeAchievementStats', () => {
  it('counts aggregate and behavioural metrics', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const kickoff = new Date('2026-06-15T12:00:00Z')
    const alice = await makeUser(db, 'alice')
    const a = await scoredMatch(c, g1, 'GROUP', kickoff)
    const b = await scoredMatch(c, g1, 'GROUP', kickoff)
    const cc = await scoredMatch(c, g1, 'GROUP', kickoff)
    // A: early bird + joker exact. B: night owl + crowd bonus. C: deadline dancer.
    await pred({ userId: alice, matchId: a, roundId: g1, tier: 'EXACT', points: 3, isJoker: true, createdAt: new Date('2026-06-12T12:00:00Z') })
    await pred({ userId: alice, matchId: b, roundId: g1, tier: 'DIFF', points: 5, bonus: 3, createdAt: new Date('2026-06-15T02:30:00Z') })
    await pred({ userId: alice, matchId: cc, roundId: g1, tier: 'OUTCOME', points: 1, createdAt: new Date('2026-06-15T11:58:00Z') })

    const s = await stats(c, alice)
    expect(s).toMatchObject({
      predictions: 3,
      exact: 1,
      points: 9,
      crowdHits: 1,
      jokerExact: 1,
      earlyBird: 1,
      nightOwl: 1,
      deadlineDancer: 1,
    })
  })

  it('measures the longest EXACT and non-MISS streaks in kickoff order', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const alice = await makeUser(db, 'alice')
    // tiers in kickoff order: EXACT, DIFF, EXACT, EXACT, MISS -> exact streak 2, non-miss streak 4.
    const seq: BaseTier[] = ['EXACT', 'DIFF', 'EXACT', 'EXACT', 'MISS']
    // Insert in reverse to prove the sort orders by kickoff, not insertion.
    for (let i = seq.length - 1; i >= 0; i--) {
      const m = await scoredMatch(c, g1, 'GROUP', new Date(`2026-06-1${i}T12:00:00Z`))
      await pred({ userId: alice, matchId: m, roundId: g1, tier: seq[i], points: seq[i] === 'MISS' ? 0 : 2 })
    }
    const s = await stats(c, alice)
    expect(s.exactStreak).toBe(2)
    expect(s.scoringStreak).toBe(4)
  })

  it('credits a perfect round and completion only when all scored matches are covered', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const g2 = await roundId(c, 'GROUP', 2)
    const alice = await makeUser(db, 'alice')
    const bob = await makeUser(db, 'bob')
    const m1 = await scoredMatch(c, g1, 'GROUP', new Date('2026-06-11T12:00:00Z'))
    const m2 = await scoredMatch(c, g1, 'GROUP', new Date('2026-06-11T15:00:00Z'))
    const m3 = await scoredMatch(c, g2, 'GROUP', new Date('2026-06-12T12:00:00Z'))
    // Alice: both G1 matches EXACT (perfect round) + predicts every scored match.
    await pred({ userId: alice, matchId: m1, roundId: g1, tier: 'EXACT', points: 3 })
    await pred({ userId: alice, matchId: m2, roundId: g1, tier: 'EXACT', points: 3 })
    await pred({ userId: alice, matchId: m3, roundId: g2, tier: 'DIFF', points: 2 })
    // Bob: only one of the two G1 matches, so no perfect round and not complete.
    await pred({ userId: bob, matchId: m1, roundId: g1, tier: 'EXACT', points: 3 })

    const a = await stats(c, alice)
    expect(a.perfectRounds).toBe(1)
    expect(a.completed).toBe(1)
    const b = await stats(c, bob)
    expect(b.perfectRounds).toBe(0)
    expect(b.completed).toBe(0)
  })

  it('does not credit a perfect round when the round has no scored matches', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const alice = await makeUser(db, 'alice')
    // A finished match left in PENDING scoring state: the prediction is graded but
    // the round has no SCORED match, so the round-total lookup falls back to 0.
    const m = await makeMatch(db, {
      competitionId: c,
      roundId: g1,
      stage: 'GROUP',
      status: 'FINISHED',
      fullTimeHome: 1,
      fullTimeAway: 0,
      winner: 'HOME',
      kickoffTime: new Date('2026-06-11T12:00:00Z'),
    })
    await pred({ userId: alice, matchId: m, roundId: g1, tier: 'EXACT', points: 3 })
    expect((await stats(c, alice)).perfectRounds).toBe(0)
  })

  it('credits lone-wolf only for the sole EXACT on a match', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const alice = await makeUser(db, 'alice')
    const bob = await makeUser(db, 'bob')
    const solo = await scoredMatch(c, g1, 'GROUP', new Date('2026-06-11T12:00:00Z'))
    const shared = await scoredMatch(c, g1, 'GROUP', new Date('2026-06-11T15:00:00Z'))
    await pred({ userId: alice, matchId: solo, roundId: g1, tier: 'EXACT', points: 3 })
    await pred({ userId: bob, matchId: solo, roundId: g1, tier: 'DIFF', points: 2 })
    await pred({ userId: alice, matchId: shared, roundId: g1, tier: 'EXACT', points: 3 })
    await pred({ userId: bob, matchId: shared, roundId: g1, tier: 'EXACT', points: 3 })

    expect((await stats(c, alice)).loneWolf).toBe(1)
    expect((await stats(c, bob)).loneWolf).toBe(0)
  })

  it('flags oracle, golden-touch and underdog from winning meta picks', async () => {
    const c = await seedCompetition(db)
    const alice = await makeUser(db, 'alice')
    const bob = await makeUser(db, 'bob')
    const dave = await makeUser(db, 'dave')
    const carol = await makeUser(db, 'carol')
    await db.insert(championPick).values([
      { userId: alice, competitionId: c, teamName: 'A', teamCode: 'A', fifaRank: 5, potentialPoints: 15, awardedPoints: 15 },
      { userId: bob, competitionId: c, teamName: 'B', teamCode: 'B', fifaRank: 50, potentialPoints: 40, awardedPoints: 40 },
      { userId: dave, competitionId: c, teamName: 'D', teamCode: 'D', fifaRank: null, potentialPoints: 40, awardedPoints: 40 },
      { userId: carol, competitionId: c, teamName: 'C', teamCode: 'C', fifaRank: 3, potentialPoints: 10, awardedPoints: 0 },
    ])
    await db.insert(bestScorerPick).values({ userId: alice, competitionId: c, playerId: 'p', playerName: 'P', teamName: 'A', awardedPoints: 10 })

    const all = await computeAchievementStats(db, c)
    expect(all.get(alice)).toMatchObject({ championOracle: 1, goldenTouch: 1, underdog: 0 })
    expect(all.get(bob)).toMatchObject({ championOracle: 1, underdog: 1 })
    expect(all.get(dave)).toMatchObject({ championOracle: 1, underdog: 1 })
    expect(all.has(carol)).toBe(false) // pick paid 0 -> not counted, no predictions
  })

  it('counts trophies held and a top-3 finish', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const users = ['u1', 'u2', 'u3', 'u4']
    for (const u of users) await makeUser(db, u)
    const points = [10, 8, 6, 4]
    for (let i = 0; i < users.length; i++) {
      const m = await scoredMatch(c, g1, 'GROUP', new Date(`2026-06-1${i}T12:00:00Z`))
      await pred({ userId: users[i], matchId: m, roundId: g1, tier: 'EXACT', points: points[i] })
    }
    await db.insert(competitionAward).values([
      { competitionId: c, userId: 'u1', type: 'OVERALL', value: 10 },
      { competitionId: c, userId: 'u1', type: 'GROUP_PHASE', value: 10 },
      { competitionId: c, userId: 'u1', type: 'MADAME_IRMA', value: 1 },
    ])

    const all = await computeAchievementStats(db, c)
    expect(all.get('u1')).toMatchObject({ trophies: 3, podium: 1 })
    expect(all.get('u3')?.podium).toBe(1)
    expect(all.get('u4')?.podium).toBe(0)
  })
})

describe('evaluateAchievements', () => {
  it('inserts new badges, grades up, and is idempotent', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const alice = await makeUser(db, 'alice')
    const addExact = async (n: number) => {
      for (let i = 0; i < n; i++) {
        const m = await scoredMatch(c, g1, 'GROUP', new Date(2026, 5, 1, 12, i))
        await pred({ userId: alice, matchId: m, roundId: g1, tier: 'EXACT', points: 3 })
      }
    }
    await addExact(5)
    const first = await evaluateAchievements(db, c)
    expect(first.some((u) => u.key === 'first-blood')).toBe(true)
    expect(first.some((u) => u.key === 'sharpshooter' && u.tier === 'BRONZE')).toBe(true)

    // Rerun with no change: nothing new.
    expect(await evaluateAchievements(db, c)).toHaveLength(0)

    // Cross the SILVER threshold (15 EXACT): sharpshooter grades up.
    await addExact(10)
    const graded = await evaluateAchievements(db, c)
    expect(graded.some((u) => u.key === 'sharpshooter' && u.tier === 'SILVER')).toBe(true)
    const sharp = (await db.select().from(userAchievement).where(eq(userAchievement.key, 'sharpshooter')))[0]
    expect(sharp).toMatchObject({ tier: 'SILVER', progress: 15 })
  })

  it('grades up a badge whose stored tier was null', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const alice = await makeUser(db, 'alice')
    const m = await scoredMatch(c, g1, 'GROUP', new Date('2026-06-11T12:00:00Z'))
    await pred({ userId: alice, matchId: m, roundId: g1, tier: 'EXACT', points: 3 })
    // A pre-existing row with a null tier must still grade up on evaluation.
    await db.insert(userAchievement).values({ userId: alice, competitionId: c, key: 'first-blood', tier: null, progress: 0 })
    const newly = await evaluateAchievements(db, c)
    expect(newly.some((u) => u.key === 'first-blood' && u.tier === 'BRONZE')).toBe(true)
  })
})

describe('grantAchievement', () => {
  it('grants a global badge once, idempotently', async () => {
    const alice = await makeUser(db, 'alice')
    expect(await grantAchievement(db, { userId: alice, competitionId: null, key: 'the-magic-word', tier: 'GOLD' })).toBe(true)
    expect(await grantAchievement(db, { userId: alice, competitionId: null, key: 'the-magic-word', tier: 'GOLD' })).toBe(false)
    const rows = await db.select().from(userAchievement).where(eq(userAchievement.userId, alice))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ competitionId: null, key: 'the-magic-word', tier: 'GOLD' })
  })

  it('scopes a granted badge to a competition', async () => {
    const c = await seedCompetition(db)
    const alice = await makeUser(db, 'alice')
    expect(await grantAchievement(db, { userId: alice, competitionId: c, key: 'x' })).toBe(true)
    expect(await grantAchievement(db, { userId: alice, competitionId: c, key: 'x' })).toBe(false)
  })
})
