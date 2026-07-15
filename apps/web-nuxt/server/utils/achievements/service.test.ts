import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../../db/types'
import {
  bestScorerPick,
  championPick,
  competitionAward,
  match,
  prediction,
  predictionCommitment,
  round,
  userAchievement,
} from '../../../db/schema'
import type { BaseTier } from '../scoring/tiers'
import { createTestDb } from '../../../tests/db'
import { makeMatch, makePrediction, makeUser, seedCompetition } from '../../../tests/factories'
import { ACHIEVEMENTS, COLLECTOR_ACHIEVEMENT_KEY } from './catalog'
import { computeAchievementStats, evaluateAchievements, evaluatePickTimeAchievements, grantAchievement } from './service'

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
      totalPoints: o.points ?? (o.tier ? 0 : null),
      basePoints: o.points ?? null,
      bonusPoints: o.bonus ?? 0,
      scoredAt: o.tier ? new Date() : null,
      ...(o.createdAt ? { createdAt: o.createdAt } : {}),
    })
    .where(eq(prediction.id, id))
  return id
}

// Append one commitment-ledger entry per scoreline given, oldest first. The
// achievement code counts DISTINCT scorelines, so the goals are what matters and
// the hash fields just need to be unique: `['1-0', '1-2']` is an edited pick,
// `['1-0', '1-0']` is the same pick committed twice by the save race.
let commitSeq = 1
async function commit(predictionId: string, userId: string, matchId: string, scorelines: string[]): Promise<void> {
  for (const line of scorelines) {
    const [home, away] = line.split('-').map(Number)
    const seq = commitSeq++
    await db.insert(predictionCommitment).values({
      seq,
      predictionId,
      userId,
      subject: 'subj',
      matchId,
      homeGoals: home,
      awayGoals: away,
      salt: `salt-${seq}`,
      commitment: `commit-${seq}`,
      prevHash: `prev-${seq}`,
      entryHash: `entry-${seq}`,
      createdAt: new Date(),
    })
  }
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

  it('counts the scoreline, final, and repeat-team metrics', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const fin = await roundId(c, 'FINAL')
    const alice = await makeUser(db, 'alice')
    const kickoff = new Date('2026-06-15T12:00:00Z')
    const draw = await scoredMatch(c, g1, 'GROUP', kickoff)
    const rush = await scoredMatch(c, g1, 'GROUP', kickoff)
    const finalMatch = await scoredMatch(c, fin, 'FINAL', new Date('2026-07-19T18:00:00Z'))
    // A goalless draw called exact (bore-draw), a 3-2 thriller (goal-rush), the final
    // (grand-finale). All three matches share the default teams, so bogeyTeam = 3.
    await pred({ userId: alice, matchId: draw, roundId: g1, tier: 'EXACT', points: 3, home: 0, away: 0 })
    await pred({ userId: alice, matchId: rush, roundId: g1, tier: 'EXACT', points: 3, home: 3, away: 2 })
    await pred({ userId: alice, matchId: finalMatch, roundId: fin, tier: 'EXACT', points: 6, home: 1, away: 0 })

    expect(await stats(c, alice)).toMatchObject({ boreDraw: 1, goalRush: 1, finalExact: 1, bogeyTeam: 3 })
  })

  it('reports the current ongoing streak alongside the best', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const alice = await makeUser(db, 'alice')
    const t0 = new Date('2026-06-15T12:00:00Z')
    const mk = async (i: number, tier: BaseTier) => {
      const m = await scoredMatch(c, g1, 'GROUP', new Date(t0.getTime() + i * 3_600_000))
      await pred({ userId: alice, matchId: m, roundId: g1, tier, points: tier === 'EXACT' ? 3 : 0 })
    }
    // EXACT, EXACT, MISS, EXACT in kickoff order: best exact run 2, ongoing run 1.
    await mk(0, 'EXACT')
    await mk(1, 'EXACT')
    await mk(2, 'MISS')
    await mk(3, 'EXACT')
    expect(await stats(c, alice)).toMatchObject({
      exactStreak: 2,
      curExactStreak: 1,
      scoringStreak: 2,
      curScoringStreak: 1,
    })
  })

  it('excludes the final and third-place rounds from Flawless', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const fin = await roundId(c, 'FINAL')
    const alice = await makeUser(db, 'alice')
    // A perfect GROUP round counts; the final called exact does NOT add a Flawless.
    const gm = await scoredMatch(c, g1, 'GROUP', new Date('2026-06-15T12:00:00Z'))
    await pred({ userId: alice, matchId: gm, roundId: g1, tier: 'EXACT', points: 3 })
    const fm = await scoredMatch(c, fin, 'FINAL', new Date('2026-07-19T18:00:00Z'))
    await pred({ userId: alice, matchId: fm, roundId: fin, tier: 'EXACT', points: 6 })
    expect((await stats(c, alice)).perfectRounds).toBe(1)
  })

  it('awards set-and-forget for an untouched full round, not an edited one', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const alice = await makeUser(db, 'alice')
    const bob = await makeUser(db, 'bob')
    const kickoff = new Date('2026-06-15T12:00:00Z')
    const m1 = await scoredMatch(c, g1, 'GROUP', kickoff)
    const m2 = await scoredMatch(c, g1, 'GROUP', kickoff)
    // Alice predicted both matches of the round, each committed once (never edited).
    const a1 = await pred({ userId: alice, matchId: m1, roundId: g1, tier: 'DIFF', points: 1, home: 1, away: 0 })
    const a2 = await pred({ userId: alice, matchId: m2, roundId: g1, tier: 'DIFF', points: 1, home: 2, away: 1 })
    await commit(a1, alice, m1, ['1-0'])
    await commit(a2, alice, m2, ['2-1'])
    // Bob predicted both too, but edited one of them - and only its away goal, so
    // the whole scoreline has to be compared to see it.
    const b1 = await pred({ userId: bob, matchId: m1, roundId: g1, tier: 'DIFF', points: 1, home: 1, away: 0 })
    const b2 = await pred({ userId: bob, matchId: m2, roundId: g1, tier: 'DIFF', points: 1, home: 1, away: 2 })
    await commit(b1, bob, m1, ['1-0'])
    await commit(b2, bob, m2, ['1-0', '1-2'])
    expect((await stats(c, alice)).setAndForget).toBe(1)
    expect((await stats(c, bob)).setAndForget).toBe(0)
  })

  it('awards set-and-forget despite same-score duplicate ledger entries', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const alice = await makeUser(db, 'alice')
    const kickoff = new Date('2026-06-15T12:00:00Z')
    const m1 = await scoredMatch(c, g1, 'GROUP', kickoff)
    const m2 = await scoredMatch(c, g1, 'GROUP', kickoff)
    // Both picks carry two ledger entries, but each pair holds the same scoreline:
    // a save race duplicated the entry, the user never edited anything.
    const a1 = await pred({ userId: alice, matchId: m1, roundId: g1, tier: 'DIFF', points: 1, home: 1, away: 0 })
    const a2 = await pred({ userId: alice, matchId: m2, roundId: g1, tier: 'DIFF', points: 1, home: 2, away: 1 })
    await commit(a1, alice, m1, ['1-0', '1-0'])
    await commit(a2, alice, m2, ['2-1', '2-1'])
    expect((await stats(c, alice)).setAndForget).toBe(1)
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

  it('does not credit Flawless for an incomplete round with only some matches scored', async () => {
    const c = await seedCompetition(db)
    const qf = await roundId(c, 'QF')
    const alice = await makeUser(db, 'alice')
    // One QF match played and called EXACT; the round's other three are still scheduled.
    const played = await scoredMatch(c, qf, 'QF', new Date('2026-07-10T18:00:00Z'))
    for (let i = 0; i < 3; i++) {
      await makeMatch(db, { competitionId: c, roundId: qf, stage: 'QF', kickoffTime: new Date('2026-07-11T18:00:00Z') })
    }
    await pred({ userId: alice, matchId: played, roundId: qf, tier: 'EXACT', points: 5 })
    // The round is not complete, so a lone exact must not read as a perfect round.
    expect((await stats(c, alice)).perfectRounds).toBe(0)

    // Score the rest and call them all EXACT: now the whole round is complete and perfect.
    const rest = await db.select().from(match).where(eq(match.roundId, qf))
    for (const m of rest) {
      await db
        .update(match)
        .set({ scoringState: 'SCORED', status: 'FINISHED', winner: 'HOME', fullTimeHome: 1, fullTimeAway: 0 })
        .where(eq(match.id, m.id))
      if (m.id !== played) await pred({ userId: alice, matchId: m.id, roundId: qf, tier: 'EXACT', points: 5 })
    }
    expect((await stats(c, alice)).perfectRounds).toBe(1)
  })

  it('does not credit set-and-forget for an incomplete round', async () => {
    const c = await seedCompetition(db)
    const qf = await roundId(c, 'QF')
    const alice = await makeUser(db, 'alice')
    // One match scored and left untouched, but a second match of the round is unplayed.
    const played = await scoredMatch(c, qf, 'QF', new Date('2026-07-10T18:00:00Z'))
    await makeMatch(db, { competitionId: c, roundId: qf, stage: 'QF', kickoffTime: new Date('2026-07-11T18:00:00Z') })
    const p = await pred({ userId: alice, matchId: played, roundId: qf, tier: 'DIFF', points: 1, home: 1, away: 0 })
    await commit(p, alice, played, ['1-0'])
    expect((await stats(c, alice)).setAndForget).toBe(0)
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

  it('revokes a revocable badge when its state is undone, keeping a high-water one', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const alice = await makeUser(db, 'alice')
    // A complete, all-EXACT round earns Flawless (revocable) and feeds sharpshooter (high-water).
    for (let i = 0; i < 5; i++) {
      const m = await scoredMatch(c, g1, 'GROUP', new Date(2026, 5, 11, 12, i))
      await pred({ userId: alice, matchId: m, roundId: g1, tier: 'EXACT', points: 3 })
    }
    await evaluateAchievements(db, c)
    expect(await db.select().from(userAchievement).where(eq(userAchievement.key, 'perfect-round'))).toHaveLength(1)
    expect((await db.select().from(userAchievement).where(eq(userAchievement.key, 'sharpshooter')))[0]?.tier).toBe('BRONZE')

    // Rewind: an unplayed match appears in the round, so it is no longer complete.
    await makeMatch(db, { competitionId: c, roundId: g1, stage: 'GROUP', kickoffTime: new Date('2026-06-12T12:00:00Z') })
    await evaluateAchievements(db, c)
    // Flawless self-heals away; sharpshooter (5 exacts, unchanged) stays.
    expect(await db.select().from(userAchievement).where(eq(userAchievement.key, 'perfect-round'))).toHaveLength(0)
    expect((await db.select().from(userAchievement).where(eq(userAchievement.key, 'sharpshooter')))[0]?.tier).toBe('BRONZE')
  })

  it('demotes a tiered revocable badge when a rescore drops its band', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const alice = await makeUser(db, 'alice')
    // Two complete groups fully called -> group-guru at SILVER (2).
    const groups: Record<string, string[]> = { A: [], B: [] }
    for (const grp of ['A', 'B']) {
      for (let i = 0; i < 2; i++) {
        const m = await scoredTeam(c, g1, { group: grp, home: `${grp}${i}`, away: `X${grp}${i}`, kickoff: new Date(2026, 5, 11, 12, grp.charCodeAt(0) + i) })
        groups[grp].push(m)
        await pred({ userId: alice, matchId: m, roundId: g1, tier: 'OUTCOME' })
      }
    }
    await evaluateAchievements(db, c)
    expect((await db.select().from(userAchievement).where(eq(userAchievement.key, 'group-guru')))[0]?.tier).toBe('SILVER')

    // An unplayed match joins group B -> B is no longer complete, so only A counts.
    await makeMatch(db, { competitionId: c, roundId: g1, stage: 'GROUP', groupName: 'B', kickoffTime: new Date('2026-06-13T12:00:00Z') })
    await evaluateAchievements(db, c)
    // Revocable: the tier demotes to BRONZE rather than staying at its high-water SILVER.
    expect((await db.select().from(userAchievement).where(eq(userAchievement.key, 'group-guru')))[0]?.tier).toBe('BRONZE')
  })

  it('revokes completionist when a rewound tournament un-decides the final', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const fin = await roundId(c, 'FINAL')
    const alice = await makeUser(db, 'alice')
    const m = await scoredMatch(c, g1, 'GROUP', new Date('2026-06-11T12:00:00Z'))
    const finalMatch = await decidedFinal(c, fin)
    await pred({ userId: alice, matchId: m, roundId: g1, tier: 'EXACT', points: 3 })
    await pred({ userId: alice, matchId: finalMatch, roundId: fin, tier: 'EXACT', points: 6 })
    await evaluateAchievements(db, c)
    expect(await db.select().from(userAchievement).where(eq(userAchievement.key, 'completionist'))).toHaveLength(1)

    // The final reverts to scheduled/pending: hasDecidedFinal flips false again.
    await db.update(match).set({ status: 'SCHEDULED', winner: null, scoringState: 'PENDING' }).where(eq(match.id, finalMatch))
    await evaluateAchievements(db, c)
    expect(await db.select().from(userAchievement).where(eq(userAchievement.key, 'completionist'))).toHaveLength(0)
  })

  it('revokes a revocable badge for a user who dropped out of the stats entirely', async () => {
    const c = await seedCompetition(db)
    const alice = await makeUser(db, 'alice')
    // Alice has no predictions or picks left in this comp (a reset wiped them), so she
    // is absent from the stats map - but two stale competition badges survive from before.
    await db.insert(userAchievement).values([
      { userId: alice, competitionId: c, key: 'completionist', tier: 'BRONZE' as const, progress: 1 },
      { userId: alice, competitionId: c, key: 'sharpshooter', tier: 'BRONZE' as const, progress: 5 },
    ])
    await evaluateAchievements(db, c)
    const keys = (await db.select().from(userAchievement).where(eq(userAchievement.userId, alice))).map((r) => r.key)
    expect(keys).not.toContain('completionist') // revocable -> swept even though alice has no stats
    expect(keys).toContain('sharpshooter') // high-water tally -> kept
  })
})

describe('evaluatePickTimeAchievements', () => {
  it('grants the pick-time behavioral badges at save time, idempotently', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const alice = await makeUser(db, 'alice')
    const kickoff = new Date('2026-06-15T12:00:00Z')
    const a = await scoredMatch(c, g1, 'GROUP', kickoff)
    const b = await scoredMatch(c, g1, 'GROUP', kickoff)
    const cc = await scoredMatch(c, g1, 'GROUP', kickoff)
    await pred({ userId: alice, matchId: a, roundId: g1, createdAt: new Date('2026-06-12T12:00:00Z') }) // early bird
    await pred({ userId: alice, matchId: b, roundId: g1, createdAt: new Date('2026-06-15T02:30:00Z') }) // night owl
    await pred({ userId: alice, matchId: cc, roundId: g1, createdAt: new Date('2026-06-15T11:58:00Z') }) // deadline dancer

    const newly = await evaluatePickTimeAchievements(db, c, alice)
    expect(newly.map((u) => u.key).sort()).toEqual(['deadline-dancer', 'early-bird', 'night-owl'])
    const rows = await db.select().from(userAchievement).where(eq(userAchievement.userId, alice))
    expect(rows.map((r) => r.key).sort()).toEqual(['deadline-dancer', 'early-bird', 'night-owl'])
    expect(rows.every((r) => r.competitionId === c)).toBe(true)
    // Idempotent: a second pass grants nothing.
    expect(await evaluatePickTimeAchievements(db, c, alice)).toHaveLength(0)
  })

  it('grants nothing when no pick falls in a window', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const alice = await makeUser(db, 'alice')
    const kickoff = new Date('2026-06-15T12:00:00Z')
    const m = await scoredMatch(c, g1, 'GROUP', kickoff)
    // Saved 6h before kickoff, midday UTC: no early-bird, night-owl, or deadline.
    await pred({ userId: alice, matchId: m, roundId: g1, createdAt: new Date('2026-06-15T06:00:00Z') })
    expect(await evaluatePickTimeAchievements(db, c, alice)).toHaveLength(0)
    expect(await db.select().from(userAchievement).where(eq(userAchievement.userId, alice))).toHaveLength(0)
  })

  it('grades early-bird up and refreshes progress as more early picks land', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const alice = await makeUser(db, 'alice')
    const early = new Date('2026-06-12T12:00:00Z')
    const kickoff = new Date('2026-06-15T12:00:00Z')
    const addEarly = async (n: number) => {
      for (let i = 0; i < n; i++) {
        const m = await scoredMatch(c, g1, 'GROUP', kickoff)
        await pred({ userId: alice, matchId: m, roundId: g1, createdAt: early })
      }
    }
    await addEarly(1)
    expect((await evaluatePickTimeAchievements(db, c, alice)).some((u) => u.key === 'early-bird' && u.tier === 'BRONZE')).toBe(
      true,
    )
    // 5 total early picks: still BRONZE, but progress refreshes (no new unlock).
    await addEarly(4)
    expect(await evaluatePickTimeAchievements(db, c, alice)).toHaveLength(0)
    const eb = (await db.select().from(userAchievement).where(eq(userAchievement.key, 'early-bird')))[0]
    expect(eb).toMatchObject({ tier: 'BRONZE', progress: 5 })
    // 10 total: grades up to SILVER.
    await addEarly(5)
    expect((await evaluatePickTimeAchievements(db, c, alice)).some((u) => u.key === 'early-bird' && u.tier === 'SILVER')).toBe(
      true,
    )
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
    const fin = await roundId(c, 'FINAL')
    const alice = await makeUser(db, 'alice')
    // Genuinely satisfy the revocable badges (they no longer count on a bare row):
    // a complete all-EXACT round (perfect-round), a complete named group fully called
    // (group-guru), a decided final so the tournament is over, and every scored match
    // predicted (completionist), leaving alice top of the one-player board (podium).
    const m = await scoredTeam(c, g1, { group: 'A', home: 'HOM', away: 'AWY', kickoff: new Date('2026-06-11T12:00:00Z') })
    await pred({ userId: alice, matchId: m, roundId: g1, tier: 'EXACT', points: 3 })
    const finalMatch = await decidedFinal(c, fin)
    await pred({ userId: alice, matchId: finalMatch, roundId: fin, tier: 'EXACT', points: 6 })
    // Pre-hold every remaining non-secret badge.
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

// A scored match with explicit team codes / stage / group / winner - the fixtures the
// team-, champion- and group-scoped badges read. kickoff is spread so streaks/opener
// ordering stays stable and the final always kicks off last.
async function scoredTeam(
  competitionId: string,
  rid: string,
  o: { stage?: string; group?: string | null; home: string; away: string; winner?: 'HOME' | 'AWAY'; kickoff: Date },
): Promise<string> {
  const id = await makeMatch(db, {
    competitionId,
    roundId: rid,
    stage: (o.stage ?? 'GROUP') as never,
    groupName: o.group ?? null,
    homeTeamCode: o.home,
    awayTeamCode: o.away,
    status: 'FINISHED',
    fullTimeHome: o.winner === 'AWAY' ? 0 : 1,
    fullTimeAway: o.winner === 'AWAY' ? 1 : 0,
    winner: o.winner ?? 'HOME',
    kickoffTime: o.kickoff,
  })
  await db.update(match).set({ scoringState: 'SCORED' }).where(eq(match.id, id))
  return id
}

describe('Form Reader (teamsRead)', () => {
  it('counts teams with 5+ correct-outcome (non-MISS) calls, ignoring MISS', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const alice = await makeUser(db, 'alice')
    let k = 0
    const nextKick = () => new Date(2026, 5, 11, 12, k++)
    // BRA: 5 non-MISS -> counts. ARG: 4 non-MISS + 1 MISS -> does not.
    for (let i = 0; i < 5; i++) {
      const m = await scoredTeam(c, g1, { home: 'BRA', away: `X${i}`, kickoff: nextKick() })
      await pred({ userId: alice, matchId: m, roundId: g1, tier: i === 0 ? 'EXACT' : 'OUTCOME' })
    }
    // A BRA fixture whose opponent code is null (a still-TBD side): the null code is
    // skipped, BRA still tallies. Exercises the null-code guard.
    const nullSide = await makeMatch(db, {
      competitionId: c,
      roundId: g1,
      stage: 'GROUP',
      homeTeamCode: 'BRA',
      awayTeamCode: null,
      status: 'FINISHED',
      fullTimeHome: 1,
      fullTimeAway: 0,
      winner: 'HOME',
      kickoffTime: nextKick(),
    })
    await db.update(match).set({ scoringState: 'SCORED' }).where(eq(match.id, nullSide))
    await pred({ userId: alice, matchId: nullSide, roundId: g1, tier: 'OUTCOME' })
    for (let i = 0; i < 5; i++) {
      const m = await scoredTeam(c, g1, { home: 'ARG', away: `Y${i}`, kickoff: nextKick() })
      await pred({ userId: alice, matchId: m, roundId: g1, tier: i === 4 ? 'MISS' : 'DIFF' })
    }
    expect((await stats(c, alice)).teamsRead).toBe(1)
  })

  it('grades 3/5/7 teams', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const alice = await makeUser(db, 'alice')
    let k = 0
    for (let t = 0; t < 3; t++) {
      for (let i = 0; i < 5; i++) {
        const m = await scoredTeam(c, g1, { home: `T${t}`, away: `Z${t}${i}`, kickoff: new Date(2026, 5, 11, 12, k++) })
        await pred({ userId: alice, matchId: m, roundId: g1, tier: 'OUTCOME' })
      }
    }
    expect((await stats(c, alice)).teamsRead).toBe(3)
    const def = ACHIEVEMENTS.find((d) => d.key === 'form-reader')!
    expect(def.tiers.map((t) => t.threshold)).toEqual([3, 5, 7])
  })
})

describe("Champion's Path (championPath)", () => {
  async function withChampion(): Promise<{ c: string; alice: string; braMatches: string[] }> {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const finalR = await roundId(c, 'FINAL')
    const alice = await makeUser(db, 'alice')
    // BRA plays two group games then wins the final -> BRA is champion.
    const m1 = await scoredTeam(c, g1, { home: 'BRA', away: 'SRB', kickoff: new Date('2026-06-11T12:00:00Z') })
    const m2 = await scoredTeam(c, g1, { home: 'CMR', away: 'BRA', kickoff: new Date('2026-06-15T12:00:00Z') })
    const mf = await scoredTeam(c, finalR, { stage: 'FINAL', home: 'BRA', away: 'ARG', winner: 'HOME', kickoff: new Date('2026-07-19T18:00:00Z') })
    return { c, alice, braMatches: [m1, m2, mf] }
  }

  it('grants when every champion match outcome is called', async () => {
    const { c, alice, braMatches } = await withChampion()
    const g1 = await roundId(c, 'GROUP', 1)
    const finalR = await roundId(c, 'FINAL')
    await pred({ userId: alice, matchId: braMatches[0], roundId: g1, tier: 'OUTCOME' })
    await pred({ userId: alice, matchId: braMatches[1], roundId: g1, tier: 'DIFF' })
    await pred({ userId: alice, matchId: braMatches[2], roundId: finalR, tier: 'EXACT' })
    expect((await stats(c, alice)).championPath).toBe(1)
  })

  it('reaches the diamond grade when every champion match is called EXACT', async () => {
    const { c, alice, braMatches } = await withChampion()
    const g1 = await roundId(c, 'GROUP', 1)
    const finalR = await roundId(c, 'FINAL')
    await pred({ userId: alice, matchId: braMatches[0], roundId: g1, tier: 'EXACT' })
    await pred({ userId: alice, matchId: braMatches[1], roundId: g1, tier: 'EXACT' })
    await pred({ userId: alice, matchId: braMatches[2], roundId: finalR, tier: 'EXACT' })
    expect((await stats(c, alice)).championPath).toBe(2)
    // The catalog maps 1 -> GOLD, 2 -> DIAMOND.
    expect(ACHIEVEMENTS.find((d) => d.key === 'champions-path')!.tiers).toEqual([
      { tier: 'GOLD', threshold: 1 },
      { tier: 'DIAMOND', threshold: 2 },
    ])
  })

  it('withholds when a champion match is MISSed or unpredicted', async () => {
    const { c, alice, braMatches } = await withChampion()
    const g1 = await roundId(c, 'GROUP', 1)
    const finalR = await roundId(c, 'FINAL')
    await pred({ userId: alice, matchId: braMatches[0], roundId: g1, tier: 'MISS' })
    await pred({ userId: alice, matchId: braMatches[2], roundId: finalR, tier: 'EXACT' })
    // braMatches[1] left unpredicted entirely.
    expect((await stats(c, alice)).championPath).toBe(0)
  })

  it('resolves the champion from the away side of the final', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const finalR = await roundId(c, 'FINAL')
    const alice = await makeUser(db, 'alice')
    // ARG plays a group game then wins the final from the away side -> ARG is champion.
    const grp = await scoredTeam(c, g1, { home: 'NGA', away: 'ARG', kickoff: new Date('2026-06-12T12:00:00Z') })
    const fin = await scoredTeam(c, finalR, { stage: 'FINAL', home: 'FRA', away: 'ARG', winner: 'AWAY', kickoff: new Date('2026-07-19T18:00:00Z') })
    await pred({ userId: alice, matchId: grp, roundId: g1, tier: 'OUTCOME' })
    await pred({ userId: alice, matchId: fin, roundId: finalR, tier: 'OUTCOME' })
    expect((await stats(c, alice)).championPath).toBe(1)
  })

  it('withholds in the decided-but-unscored final window (final not yet SCORED)', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const finalR = await roundId(c, 'FINAL')
    const alice = await makeUser(db, 'alice')
    // BRA wins its group game (scored, called) and the final is FINISHED with a HOME
    // winner but NOT yet SCORED - the sync -> finalize window. hasDecidedFinal is true,
    // yet the champion must resolve only from a SCORED final, so the still-unscored
    // final is excluded and the badge is withheld (it would otherwise grant off the
    // group game alone, without the final ever being called).
    const grp = await scoredTeam(c, g1, { home: 'BRA', away: 'SRB', kickoff: new Date('2026-06-11T12:00:00Z') })
    const fin = await makeMatch(db, {
      competitionId: c,
      roundId: finalR,
      stage: 'FINAL',
      homeTeamCode: 'BRA',
      awayTeamCode: 'ARG',
      status: 'FINISHED',
      fullTimeHome: 1,
      fullTimeAway: 0,
      winner: 'HOME',
      kickoffTime: new Date('2026-07-19T18:00:00Z'),
    })
    await pred({ userId: alice, matchId: grp, roundId: g1, tier: 'OUTCOME' })
    await pred({ userId: alice, matchId: fin, roundId: finalR, tier: 'OUTCOME' })
    expect((await stats(c, alice)).championPath).toBe(0)
  })
})

describe('Group Guru (groupPerfect)', () => {
  it('grants for a complete group fully called, revocable in the catalog', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const alice = await makeUser(db, 'alice')
    const ms: string[] = []
    for (let i = 0; i < 3; i++) {
      ms.push(await scoredTeam(c, g1, { group: 'A', home: `A${i}`, away: `B${i}`, kickoff: new Date(2026, 5, 11, 12, i) }))
    }
    for (const m of ms) await pred({ userId: alice, matchId: m, roundId: g1, tier: 'OUTCOME' })
    expect((await stats(c, alice)).groupPerfect).toBe(1)
    expect(ACHIEVEMENTS.find((d) => d.key === 'group-guru')!.revocable).toBe(true)
    // Now graded by number of perfect groups.
    expect(ACHIEVEMENTS.find((d) => d.key === 'group-guru')!.tiers).toEqual([
      { tier: 'BRONZE', threshold: 1 },
      { tier: 'SILVER', threshold: 2 },
      { tier: 'GOLD', threshold: 3 },
    ])
  })

  it('counts each complete group the user fully called', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const alice = await makeUser(db, 'alice')
    // Groups A and B fully called (2 matches each); group C fully called too but
    // alice MISSes one of its matches, so only A and B count.
    for (const grp of ['A', 'B', 'C']) {
      const ms: string[] = []
      for (let i = 0; i < 2; i++) {
        ms.push(await scoredTeam(c, g1, { group: grp, home: `${grp}${i}`, away: `X${grp}${i}`, kickoff: new Date(2026, 5, 11, 12, grp.charCodeAt(0) + i) }))
      }
      await pred({ userId: alice, matchId: ms[0], roundId: g1, tier: 'OUTCOME' })
      await pred({ userId: alice, matchId: ms[1], roundId: g1, tier: grp === 'C' ? 'MISS' : 'OUTCOME' })
    }
    expect((await stats(c, alice)).groupPerfect).toBe(2)
  })

  it('withholds when a complete group is not fully called, unpredicted, or still incomplete', async () => {
    const c = await seedCompetition(db)
    const g1 = await roundId(c, 'GROUP', 1)
    const alice = await makeUser(db, 'alice')
    // Group A: complete (2 scored) but alice MISSes one -> covered < total.
    const a0 = await scoredTeam(c, g1, { group: 'A', home: 'A0', away: 'B0', kickoff: new Date(2026, 5, 11, 12, 0) })
    const a1 = await scoredTeam(c, g1, { group: 'A', home: 'A1', away: 'B1', kickoff: new Date(2026, 5, 11, 12, 1) })
    await pred({ userId: alice, matchId: a0, roundId: g1, tier: 'OUTCOME' })
    await pred({ userId: alice, matchId: a1, roundId: g1, tier: 'MISS' })
    // Group B: complete (1 scored) but alice never predicts it -> no coverage entry.
    await scoredTeam(c, g1, { group: 'B', home: 'C0', away: 'D0', kickoff: new Date(2026, 5, 11, 12, 2) })
    // Group C: one match still PENDING -> the group is incomplete and excluded.
    const c0 = await scoredTeam(c, g1, { group: 'C', home: 'E0', away: 'F0', kickoff: new Date(2026, 5, 11, 12, 3) })
    const c1 = await makeMatch(db, {
      competitionId: c,
      roundId: g1,
      stage: 'GROUP',
      groupName: 'C',
      homeTeamCode: 'E1',
      awayTeamCode: 'F1',
      kickoffTime: new Date(2026, 5, 11, 12, 4),
    })
    await pred({ userId: alice, matchId: c0, roundId: g1, tier: 'OUTCOME' })
    await pred({ userId: alice, matchId: c1, roundId: g1, tier: 'OUTCOME' })
    expect((await stats(c, alice)).groupPerfect).toBe(0)
  })
})
