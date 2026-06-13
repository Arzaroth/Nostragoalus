import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb } from '../../../tests/db'
import { makeUser, makeCompetition, seedCompetition, makeMatch } from '../../../tests/factories'
import { findRoundId } from '../sync/rounds'
import { championPick, goalEvent } from '../../../db/schema'
import { LockedError, ValidationError } from '../errors'
import {
  awardChampionBonuses,
  getMyChampionPick,
  repickChampion,
  setChampionPick,
} from '../champion/service'
import {
  awardBestScorerBonuses,
  getMyBestScorerPick,
  repickBestScorer,
  setBestScorerPick,
} from '../bestscorer/service'
import { getSecondChanceWindow, isSecondChanceOpen } from './window'

const LOCK = new Date('2026-06-11T16:00:00Z') // first kickoff overall
const WIN_START = new Date('2026-06-20T16:00:00Z') // last group round (MD3)
const WIN_END = new Date('2026-06-25T16:00:00Z') // first knockout (R32)
const DURING = new Date('2026-06-22T12:00:00Z')

// Seed a competition whose round->match kickoffs frame the second-chance window.
async function setupComp(db: Awaited<ReturnType<typeof createTestDb>>['db']) {
  const competitionId = await seedCompetition(db)
  const md1 = (await findRoundId(db, competitionId, 'GROUP', 1))!
  const md3 = (await findRoundId(db, competitionId, 'GROUP', 3))!
  const r32 = (await findRoundId(db, competitionId, 'R32', null))!
  await makeMatch(db, { competitionId, roundId: md1, kickoffTime: LOCK, stage: 'GROUP' })
  await makeMatch(db, { competitionId, roundId: md3, kickoffTime: WIN_START, stage: 'GROUP' })
  await makeMatch(db, { competitionId, roundId: r32, kickoffTime: WIN_END, stage: 'R32' })
  return competitionId
}

describe('second-chance window', () => {
  it('runs from the last group round to the first knockout', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await setupComp(db)
    const w = await getSecondChanceWindow(db, competitionId)
    expect(w.start?.toISOString()).toBe(WIN_START.toISOString())
    expect(w.end?.toISOString()).toBe(WIN_END.toISOString())
    expect(isSecondChanceOpen(w, LOCK)).toBe(false) // before it opens
    expect(isSecondChanceOpen(w, DURING)).toBe(true)
    expect(isSecondChanceOpen(w, WIN_END)).toBe(false) // closed at knockout kickoff
    await client.close()
  })

  it('has no window without group or knockout rounds', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await makeCompetition(db) // no rounds/matches
    const w = await getSecondChanceWindow(db, competitionId)
    expect(w).toEqual({ start: null, end: null })
    expect(isSecondChanceOpen(w, DURING)).toBe(false)
    await client.close()
  })
})

describe('repickChampion', () => {
  async function seedPick(db: Awaited<ReturnType<typeof createTestDb>>['db']) {
    const competitionId = await setupComp(db)
    const userId = await makeUser(db, 'u')
    await setChampionPick(
      db,
      { userId, competitionId, teamCode: 'BRA', teamName: 'Brazil', fifaRank: 1, potentialPoints: 10 },
      LOCK_MINUS,
    )
    return { competitionId, userId }
  }
  const LOCK_MINUS = new Date('2026-06-11T15:00:00Z')

  it('switches the pick, latches repicked, and keeps the original', async () => {
    const { db, client } = await createTestDb()
    const { competitionId, userId } = await seedPick(db)
    await repickChampion(
      db,
      { userId, competitionId, teamCode: 'ARG', teamName: 'Argentina', fifaRank: 2, potentialPoints: 8 },
      DURING,
    )
    const pick = await getMyChampionPick(db, userId, competitionId)
    expect(pick).toMatchObject({ teamCode: 'ARG', repicked: true, originalTeamCode: 'BRA', originalTeamName: 'Brazil' })
    await client.close()
  })

  it('a second switch keeps the first original and stays repicked', async () => {
    const { db, client } = await createTestDb()
    const { competitionId, userId } = await seedPick(db)
    await repickChampion(db, { userId, competitionId, teamCode: 'ARG', teamName: 'Argentina', fifaRank: 2, potentialPoints: 8 }, DURING)
    // Revert to the original team: still counts as repicked, original unchanged.
    await repickChampion(db, { userId, competitionId, teamCode: 'BRA', teamName: 'Brazil', fifaRank: 1, potentialPoints: 10 }, DURING)
    const pick = await getMyChampionPick(db, userId, competitionId)
    expect(pick).toMatchObject({ teamCode: 'BRA', repicked: true, originalTeamCode: 'BRA' })
    await client.close()
  })

  it('rejects outside the window and when there is no pick', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await setupComp(db)
    const userId = await makeUser(db, 'u')
    await expect(
      repickChampion(db, { userId, competitionId, teamCode: 'ARG', teamName: 'Argentina', fifaRank: 2, potentialPoints: 8 }, DURING),
    ).rejects.toThrow(ValidationError) // no existing pick
    await setChampionPick(db, { userId, competitionId, teamCode: 'BRA', teamName: 'Brazil', fifaRank: 1, potentialPoints: 10 }, LOCK_MINUS)
    await expect(
      repickChampion(db, { userId, competitionId, teamCode: 'ARG', teamName: 'Argentina', fifaRank: 2, potentialPoints: 8 }, LOCK),
    ).rejects.toThrow(LockedError) // before the window opens
    await client.close()
  })

  it('halves the award (floored) for a re-picked champion at finalize', async () => {
    const { db, client } = await createTestDb()
    const { competitionId, userId } = await seedPick(db)
    const other = await makeUser(db, 'v')
    await setChampionPick(db, { userId: other, competitionId, teamCode: 'ARG', teamName: 'Argentina', fifaRank: 2, potentialPoints: 7 }, LOCK_MINUS)
    await repickChampion(db, { userId, competitionId, teamCode: 'ARG', teamName: 'Argentina', fifaRank: 2, potentialPoints: 7 }, DURING)

    await awardChampionBonuses(db, competitionId, 'ARG')
    const me = (await db.select({ p: championPick.awardedPoints }).from(championPick).where(eq(championPick.userId, userId)))[0]
    const them = (await db.select({ p: championPick.awardedPoints }).from(championPick).where(eq(championPick.userId, other)))[0]
    expect(me?.p).toBe(3) // floor(7 / 2)
    expect(them?.p).toBe(7) // untouched pick pays full
    await client.close()
  })
})

describe('repickBestScorer', () => {
  const LOCK_MINUS = new Date('2026-06-11T15:00:00Z')
  it('switches, latches, keeps original, and halves the award', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await setupComp(db)
    const userId = await makeUser(db, 'u')
    await setBestScorerPick(db, { userId, competitionId, playerId: 'p1', playerName: 'Neymar', teamCode: 'BRA', teamName: 'Brazil' }, LOCK_MINUS)
    await repickBestScorer(db, { userId, competitionId, playerId: 'p2', playerName: 'Messi', teamCode: 'ARG', teamName: 'Argentina' }, DURING)

    const pick = await getMyBestScorerPick(db, userId, competitionId)
    expect(pick).toMatchObject({ playerId: 'p2', repicked: true, originalPlayerName: 'Neymar', originalTeamCode: 'BRA' })

    // A decided final + p2 as the lone top scorer -> halved bonus.
    const finalRound = (await findRoundId(db, competitionId, 'FINAL', null))!
    const finalId = await makeMatch(db, {
      competitionId,
      roundId: finalRound,
      kickoffTime: new Date('2026-07-19T18:00:00Z'),
      stage: 'FINAL',
      status: 'FINISHED',
      winner: 'HOME',
    })
    await db.insert(goalEvent).values({ matchId: finalId, competitionId, side: 'HOME', teamName: 'Argentina', playerId: 'p2', playerName: 'Messi', ownGoal: false })
    await awardBestScorerBonuses(db, competitionId, 10)
    const me = await getMyBestScorerPick(db, userId, competitionId)
    expect(me?.awardedPoints).toBe(5) // floor(10 / 2)
    await client.close()
  })
})
