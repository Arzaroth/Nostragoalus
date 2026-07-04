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
import { ACHIEVEMENTS, COLLECTOR_ACHIEVEMENT_KEY } from './catalog'
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

// A decided, scored final: the gate for the final-standing badges (completionist,
// podium, wooden-spoon). Kicks off after every group match so it never displaces
// the opener.
async function decidedFinal(competitionId: string, rid: string): Promise<string> {
  return scoredMatch(competitionId, rid, 'FINAL', new Date('2026-07-19T18:00:00Z'))
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
    // The tournament is over: completion only settles once the final is decided.
    const fin = await decidedFinal(c, g2)
    // Alice: both G1 matches EXACT (perfect round) + predicts every scored match.
    await pred({ userId: alice, matchId: m1, roundId: g1, tier: 'EXACT', points: 3 })
    await pred({ userId: alice, matchId: m2, roundId: g1, tier: 'EXACT', points: 3 })
    await pred({ userId: alice, matchId: m3, roundId: g2, tier: 'DIFF', points: 2 })
    await pred({ userId: alice, matchId: fin, roundId: g2, tier: 'OUTCOME', points: 1 })
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
    // Podium (and wooden-spoon) only settle once the tournament is over.
    await decidedFinal(c, g1)
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

describe('final-standing gate, opener and bad badges', () => {
  it('withholds completion, podium and wooden-spoon until the final is decided', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const alice = await makeUser(db, 'alice')
    const bob = await makeUser(db, 'bob')
    // A user who never predicts in this competition. getLeaderboard scans the whole
    // user table, so ghost sits at 0 points on the bottom rank; wooden-spoon must
    // key off the worst PARTICIPANT (bob), never this non-participant.
    const ghost = await makeUser(db, 'ghost')
    const m = await scoredMatch(c, g1, 'GROUP', new Date('2026-06-11T12:00:00Z'))
    await pred({ userId: alice, matchId: m, roundId: g1, tier: 'EXACT', points: 3 })
    await pred({ userId: bob, matchId: m, roundId: g1, tier: 'OUTCOME', points: 1 })

    // No decided final yet: alice has predicted every scored match and tops the
    // board, bob is last - but none of the final-standing badges may fire.
    let a = await stats(c, alice)
    expect(a).toMatchObject({ completed: 0, podium: 0, woodenSpoon: 0 })
    expect((await stats(c, bob)).woodenSpoon).toBe(0)

    // Decide the final: now they settle. bob (dead-last participant) earns the
    // spoon; ghost (no predictions) is not a participant and never does.
    await decidedFinal(c, g1)
    a = await stats(c, alice)
    expect(a.completed).toBe(0) // did not predict the final -> not complete
    expect(a.podium).toBe(1)
    expect((await stats(c, bob)).woodenSpoon).toBe(1)
    expect((await computeAchievementStats(db, c)).get(ghost)?.woodenSpoon ?? 0).toBe(0)
  })

  it('never awards wooden-spoon in a single-participant competition', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const solo = await makeUser(db, 'solo')
    await makeUser(db, 'onlooker') // exists in the user table but never predicts
    const m = await scoredMatch(c, g1, 'GROUP', new Date('2026-06-11T12:00:00Z'))
    await pred({ userId: solo, matchId: m, roundId: g1, tier: 'MISS', points: 0 })
    await decidedFinal(c, g1)
    // One real participant -> no contest -> no spoon, even dead last with zero points.
    expect((await stats(c, solo)).woodenSpoon).toBe(0)
  })

  it('excludes early quitters from wooden-spoon, and still awards the genuine last player', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const winner = await makeUser(db, 'winner')
    const mid = await makeUser(db, 'mid')
    const last = await makeUser(db, 'last')
    const quitter = await makeUser(db, 'quitter')
    // Four scored matches total (3 group + the final): half = 2, so a player needs
    // >= 2 predictions to be eligible.
    const m1 = await scoredMatch(c, g1, 'GROUP', new Date('2026-06-11T12:00:00Z'))
    const m2 = await scoredMatch(c, g1, 'GROUP', new Date('2026-06-12T12:00:00Z'))
    const m3 = await scoredMatch(c, g1, 'GROUP', new Date('2026-06-13T12:00:00Z'))
    const fin = await decidedFinal(c, g1)
    const all = [m1, m2, m3, fin]
    // winner + mid + last each predict all four; last scores the fewest of them
    // (one point, still strictly above the quitter's zero).
    for (const id of all) await pred({ userId: winner, matchId: id, roundId: g1, tier: 'EXACT', points: 3 })
    for (const id of all) await pred({ userId: mid, matchId: id, roundId: g1, tier: 'DIFF', points: 2 })
    await pred({ userId: last, matchId: m1, roundId: g1, tier: 'OUTCOME', points: 1 })
    for (const id of [m2, m3, fin]) await pred({ userId: last, matchId: id, roundId: g1, tier: 'MISS', points: 0 })
    // quitter bailed: a single prediction (< 2), scoring nothing -> globally dead last
    // by points, but ineligible, and must not void last's spoon.
    await pred({ userId: quitter, matchId: m1, roundId: g1, tier: 'MISS', points: 0 })

    const s = await computeAchievementStats(db, c)
    expect(s.get(last)?.woodenSpoon).toBe(1)
    expect(s.get(quitter)?.woodenSpoon ?? 0).toBe(0)
    expect(s.get(winner)?.woodenSpoon).toBe(0)
  })

  it('credits opening-act only for an EXACT on the tournament opener', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const alice = await makeUser(db, 'alice')
    const bob = await makeUser(db, 'bob')
    const opener = await scoredMatch(c, g1, 'GROUP', new Date('2026-06-11T12:00:00Z'))
    const later = await scoredMatch(c, g1, 'GROUP', new Date('2026-06-12T12:00:00Z'))
    // Alice nails the opener; bob only nails a later match.
    await pred({ userId: alice, matchId: opener, roundId: g1, tier: 'EXACT', points: 3 })
    await pred({ userId: bob, matchId: opener, roundId: g1, tier: 'DIFF', points: 2 })
    await pred({ userId: bob, matchId: later, roundId: g1, tier: 'EXACT', points: 3 })

    expect((await stats(c, alice)).openingAct).toBe(1)
    expect((await stats(c, bob)).openingAct).toBe(0)
  })

  it('measures the longest MISS streak for the cold-streak badge', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const alice = await makeUser(db, 'alice')
    // MISS, MISS, EXACT, MISS, MISS, MISS -> longest miss streak 3.
    const seq: BaseTier[] = ['MISS', 'MISS', 'EXACT', 'MISS', 'MISS', 'MISS']
    for (let i = 0; i < seq.length; i++) {
      const m = await scoredMatch(c, g1, 'GROUP', new Date(`2026-06-1${i}T12:00:00Z`))
      await pred({ userId: alice, matchId: m, roundId: g1, tier: seq[i], points: seq[i] === 'MISS' ? 0 : 3 })
    }
    expect((await stats(c, alice)).missStreak).toBe(3)
  })

  it('draws the underdog line at FIFA rank 16, not 41', async () => {
    const c = await seedCompetition(db)
    const inside = await makeUser(db, 'inside')
    const edge = await makeUser(db, 'edge')
    await db.insert(championPick).values([
      { userId: inside, competitionId: c, teamName: 'I', teamCode: 'I', fifaRank: 15, potentialPoints: 12, awardedPoints: 12 },
      { userId: edge, competitionId: c, teamName: 'E', teamCode: 'E', fifaRank: 16, potentialPoints: 20, awardedPoints: 20 },
    ])
    const all = await computeAchievementStats(db, c)
    expect(all.get(inside)?.underdog).toBe(0)
    expect(all.get(edge)?.underdog).toBe(1)
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

describe('the-collector secret', () => {
  const collectorRows = () =>
    db.select().from(userAchievement).where(eq(userAchievement.key, COLLECTOR_ACHIEVEMENT_KEY))

  it('grants once every non-secret badge is held, and is idempotent', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const alice = await makeUser(db, 'alice')
    // A prediction so alice is in the stats map.
    const m = await scoredMatch(c, g1, 'GROUP', new Date('2026-06-11T12:00:00Z'))
    await pred({ userId: alice, matchId: m, roundId: g1, tier: 'EXACT', points: 3 })
    // Pre-hold every non-secret badge.
    await db
      .insert(userAchievement)
      .values(ACHIEVEMENTS.map((d) => ({ userId: alice, competitionId: c, key: d.key, tier: 'BRONZE' as const, progress: 1 })))

    const newly = await evaluateAchievements(db, c)
    expect(newly.some((u) => u.key === COLLECTOR_ACHIEVEMENT_KEY && u.competitionId === null)).toBe(true)
    const rows = await collectorRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ competitionId: null, tier: 'GOLD' })

    const again = await evaluateAchievements(db, c)
    expect(again.some((u) => u.key === COLLECTOR_ACHIEVEMENT_KEY)).toBe(false)
    expect(await collectorRows()).toHaveLength(1)
  })

  it('withholds the collector while any badge is missing', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const alice = await makeUser(db, 'alice')
    const m = await scoredMatch(c, g1, 'GROUP', new Date('2026-06-11T12:00:00Z'))
    await pred({ userId: alice, matchId: m, roundId: g1, tier: 'EXACT', points: 3 })
    // Hold all but 'prophet' (needs 10 predictions - unreachable with one pick).
    await db.insert(userAchievement).values(
      ACHIEVEMENTS.filter((d) => d.key !== 'prophet').map((d) => ({
        userId: alice,
        competitionId: c,
        key: d.key,
        tier: 'BRONZE' as const,
        progress: 1,
      })),
    )
    await evaluateAchievements(db, c)
    expect(await collectorRows()).toHaveLength(0)
  })
})
