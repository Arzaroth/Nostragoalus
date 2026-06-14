import { describe, it, expect } from 'vitest'
import { createTestDb, type TestDb } from '../../../tests/db'
import { findRoundId } from '../sync/rounds'
import { makeMatch, makeUser, seedCompetition } from '../../../tests/factories'
import {
  awardBestScorerBonuses,
  getMyBestScorerPick,
  setBestScorerPick,
  topScorerPlayerIds,
} from './service'
import { bestScorerPick, goalEvent } from '../../../db/schema'
import { LockedError } from '../errors'

const PAST = new Date('2026-06-01T00:00:00Z')
const FUTURE = new Date('2026-06-11T16:00:00Z')

async function seedDecidedFinal(db: TestDb, competitionId: string): Promise<void> {
  const finalRound = (await findRoundId(db, competitionId, 'FINAL', null)) as string
  await makeMatch(db, { competitionId, roundId: finalRound, stage: 'FINAL', kickoffTime: PAST, status: 'FINISHED', winner: 'HOME' })
}

async function setup() {
  const ctx = await createTestDb()
  const competitionId = await seedCompetition(ctx.db)
  const roundId = (await findRoundId(ctx.db, competitionId, 'GROUP', 1)) as string
  const userId = await makeUser(ctx.db, 'u1')
  return { ...ctx, competitionId, roundId, userId }
}

const MBAPPE = { playerId: 'p-mbappe', playerName: 'Kylian MBAPPE', teamCode: 'FRA', teamName: 'France' }
const MESSI = { playerId: 'p-messi', playerName: 'Lionel MESSI', teamCode: 'ARG', teamName: 'Argentina' }

async function makeGoal(
  db: TestDb,
  opts: { matchId: string; competitionId: string; playerId: string | null; playerName?: string; ownGoal?: boolean },
) {
  await db.insert(goalEvent).values({
    matchId: opts.matchId,
    competitionId: opts.competitionId,
    side: 'HOME',
    teamName: 'France',
    teamCode: 'FRA',
    playerId: opts.playerId,
    playerName: opts.playerName ?? 'Kylian MBAPPE',
    ownGoal: opts.ownGoal ?? false,
  })
}

describe('setBestScorerPick / getMyBestScorerPick', () => {
  it('inserts then updates before the lock', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    await setBestScorerPick(db, { userId, competitionId, ...MBAPPE }, PAST)
    await setBestScorerPick(db, { userId, competitionId, ...MESSI }, PAST)
    expect(await getMyBestScorerPick(db, userId, competitionId)).toMatchObject({
      playerId: 'p-messi',
      playerName: 'Lionel MESSI',
      teamCode: 'ARG',
      teamName: 'Argentina',
    })
    await client.close()
  })

  it('throws once the competition has kicked off', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    const afterKickoff = new Date('2026-06-12T00:00:00Z')
    await expect(setBestScorerPick(db, { userId, competitionId, ...MBAPPE }, afterKickoff)).rejects.toBeInstanceOf(
      LockedError,
    )
    await client.close()
  })

  it('returns null when the user has no pick', async () => {
    const { db, client, competitionId } = await setup()
    expect(await getMyBestScorerPick(db, 'ghost', competitionId)).toBeNull()
    await client.close()
  })

  it('allows a pick when no fixtures exist yet', async () => {
    const { db, client, competitionId, userId } = await setup()
    await setBestScorerPick(db, { userId, competitionId, ...MBAPPE })
    expect((await getMyBestScorerPick(db, userId, competitionId))?.playerId).toBe('p-mbappe')
    await client.close()
  })
})

describe('topScorerPlayerIds', () => {
  it('returns every player tied at the top goal count', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST })
    await makeGoal(db, { matchId: m, competitionId, playerId: 'p-mbappe' })
    await makeGoal(db, { matchId: m, competitionId, playerId: 'p-mbappe' })
    await makeGoal(db, { matchId: m, competitionId, playerId: 'p-messi', playerName: 'Lionel MESSI' })
    await makeGoal(db, { matchId: m, competitionId, playerId: 'p-messi', playerName: 'Lionel MESSI' })
    await makeGoal(db, { matchId: m, competitionId, playerId: 'p-kane', playerName: 'Harry KANE' })
    expect((await topScorerPlayerIds(db, competitionId)).sort()).toEqual(['p-mbappe', 'p-messi'])
    await client.close()
  })

  it('ignores own goals and goals without a player id', async () => {
    const { db, client, competitionId, roundId } = await setup()
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST })
    await makeGoal(db, { matchId: m, competitionId, playerId: 'p-kane', playerName: 'Harry KANE' })
    await makeGoal(db, { matchId: m, competitionId, playerId: 'p-mbappe', ownGoal: true })
    await makeGoal(db, { matchId: m, competitionId, playerId: 'p-mbappe', ownGoal: true })
    await makeGoal(db, { matchId: m, competitionId, playerId: null, playerName: 'Unknown' })
    expect(await topScorerPlayerIds(db, competitionId)).toEqual(['p-kane'])
    await client.close()
  })

  it('returns empty when no goals have been scored', async () => {
    const { db, client, competitionId } = await setup()
    expect(await topScorerPlayerIds(db, competitionId)).toEqual([])
    await client.close()
  })
})

describe('awardBestScorerBonuses', () => {
  it('awards matching picks and resets others, idempotently', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    const other = await makeUser(db, 'u2')
    await setBestScorerPick(db, { userId, competitionId, ...MBAPPE })
    await setBestScorerPick(db, { userId: other, competitionId, ...MESSI })
    await seedDecidedFinal(db, competitionId)
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST })
    await makeGoal(db, { matchId: m, competitionId, playerId: 'p-mbappe' })

    expect(await awardBestScorerBonuses(db, competitionId, 10)).toBe(1)
    let byUser = Object.fromEntries((await db.select().from(bestScorerPick)).map((p) => [p.userId, p.awardedPoints]))
    expect(byUser[userId]).toBe(10)
    expect(byUser[other]).toBe(0)

    // Messi catches up to a tie: both picks now win.
    await makeGoal(db, { matchId: m, competitionId, playerId: 'p-messi', playerName: 'Lionel MESSI' })
    expect(await awardBestScorerBonuses(db, competitionId, 10)).toBe(2)
    byUser = Object.fromEntries((await db.select().from(bestScorerPick)).map((p) => [p.userId, p.awardedPoints]))
    expect(byUser[userId]).toBe(10)
    expect(byUser[other]).toBe(10)
    await client.close()
  })

  it('awards nothing until a final is decided', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    await setBestScorerPick(db, { userId, competitionId, ...MBAPPE })
    const m = await makeMatch(db, { competitionId, roundId, kickoffTime: PAST })
    await makeGoal(db, { matchId: m, competitionId, playerId: 'p-mbappe' })
    // No decided final yet: the Golden Boot tally is incomplete, so no bonus.
    expect(await awardBestScorerBonuses(db, competitionId, 10)).toBe(0)
    const [pick] = await db.select().from(bestScorerPick)
    expect(pick.awardedPoints).toBe(0)
    await client.close()
  })

  it('resets to zero when a final is decided but no goals are recorded', async () => {
    const { db, client, competitionId, userId } = await setup()
    await setBestScorerPick(db, { userId, competitionId, ...MBAPPE })
    await db.update(bestScorerPick).set({ awardedPoints: 10 })
    // Decided final (away win) but zero goal_event rows -> no Golden Boot winner.
    const finalRound = (await findRoundId(db, competitionId, 'FINAL', null)) as string
    await makeMatch(db, { competitionId, roundId: finalRound, stage: 'FINAL', kickoffTime: PAST, status: 'FINISHED', winner: 'AWAY' })
    expect(await awardBestScorerBonuses(db, competitionId, 10)).toBe(0)
    expect((await db.select().from(bestScorerPick))[0].awardedPoints).toBe(0)
    await client.close()
  })
})
