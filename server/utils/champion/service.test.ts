import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { findRoundId } from '../sync/rounds'
import { makeMatch, makeUser, seedCompetition } from '../../../tests/factories'
import {
  awardChampionBonuses,
  getChampionLockTime,
  getMyChampionPick,
  listCompetitionTeams,
  setChampionPick,
} from './service'
import { championPick } from '../../../db/schema'
import { LockedError } from '../errors'

const PAST = new Date('2026-06-01T00:00:00Z')
const FUTURE = new Date('2026-06-11T16:00:00Z')

async function setup() {
  const ctx = await createTestDb()
  const competitionId = await seedCompetition(ctx.db)
  const roundId = (await findRoundId(ctx.db, competitionId, 'GROUP', 1)) as string
  const userId = await makeUser(ctx.db, 'u1')
  return { ...ctx, competitionId, roundId, userId }
}

describe('getChampionLockTime', () => {
  it('returns the earliest kickoff, or null when there are no matches', async () => {
    const { db, client, competitionId, roundId } = await setup()
    expect(await getChampionLockTime(db, competitionId)).toBeNull()
    await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    await makeMatch(db, { competitionId, roundId, kickoffTime: new Date('2026-06-12T16:00:00Z') })
    expect((await getChampionLockTime(db, competitionId))?.toISOString()).toBe(FUTURE.toISOString())
    await client.close()
  })
})

describe('listCompetitionTeams', () => {
  it('returns distinct coded teams, sorted, ignoring placeholders', async () => {
    const { db, client, competitionId, roundId } = await setup()
    await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE, homeTeam: 'Mexico', homeTeamCode: 'MEX', awayTeam: 'Canada', awayTeamCode: 'CAN' })
    await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE, homeTeam: 'Mexico', homeTeamCode: 'MEX', awayTeam: 'Winner A', awayTeamCode: null })
    await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE, homeTeam: 'Winner B', homeTeamCode: null, awayTeam: 'Canada', awayTeamCode: 'CAN' })
    expect(await listCompetitionTeams(db, competitionId)).toEqual([
      { code: 'CAN', name: 'Canada' },
      { code: 'MEX', name: 'Mexico' },
    ])
    await client.close()
  })
})

describe('setChampionPick / getMyChampionPick', () => {
  it('inserts then updates before the lock', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    await setChampionPick(db, { userId, competitionId, teamCode: 'MEX', teamName: 'Mexico' }, PAST)
    await setChampionPick(db, { userId, competitionId, teamCode: 'BRA', teamName: 'Brazil' }, PAST)
    expect(await getMyChampionPick(db, userId, competitionId)).toMatchObject({ teamCode: 'BRA', teamName: 'Brazil' })
    await client.close()
  })

  it('throws once the competition has kicked off', async () => {
    const { db, client, competitionId, roundId, userId } = await setup()
    await makeMatch(db, { competitionId, roundId, kickoffTime: FUTURE })
    const afterKickoff = new Date('2026-06-12T00:00:00Z')
    await expect(
      setChampionPick(db, { userId, competitionId, teamCode: 'MEX', teamName: 'Mexico' }, afterKickoff),
    ).rejects.toBeInstanceOf(LockedError)
    await client.close()
  })

  it('returns null when the user has no pick', async () => {
    const { db, client, competitionId } = await setup()
    expect(await getMyChampionPick(db, 'ghost', competitionId)).toBeNull()
    await client.close()
  })

  it('allows a pick when no fixtures exist yet', async () => {
    const { db, client, competitionId, userId } = await setup()
    await setChampionPick(db, { userId, competitionId, teamCode: 'MEX', teamName: 'Mexico' })
    expect((await getMyChampionPick(db, userId, competitionId))?.teamCode).toBe('MEX')
    await client.close()
  })
})

describe('awardChampionBonuses', () => {
  it('awards matching picks and resets others, idempotently', async () => {
    const { db, client, competitionId, userId } = await setup()
    const other = await makeUser(db, 'u2')
    await setChampionPick(db, { userId, competitionId, teamCode: 'MEX', teamName: 'Mexico' })
    await setChampionPick(db, { userId: other, competitionId, teamCode: 'BRA', teamName: 'Brazil' })

    expect(await awardChampionBonuses(db, competitionId, 'MEX', 10)).toBe(1)
    let byUser = Object.fromEntries((await db.select().from(championPick)).map((p) => [p.userId, p.awardedPoints]))
    expect(byUser[userId]).toBe(10)
    expect(byUser[other]).toBe(0)

    expect(await awardChampionBonuses(db, competitionId, 'BRA', 10)).toBe(1)
    byUser = Object.fromEntries((await db.select().from(championPick)).map((p) => [p.userId, p.awardedPoints]))
    expect(byUser[userId]).toBe(0)
    expect(byUser[other]).toBe(10)
    await client.close()
  })

  it('resets to zero when there is no winner', async () => {
    const { db, client, competitionId, userId } = await setup()
    await setChampionPick(db, { userId, competitionId, teamCode: 'MEX', teamName: 'Mexico' })
    expect(await awardChampionBonuses(db, competitionId, null, 10)).toBe(0)
    expect((await db.select().from(championPick))[0].awardedPoints).toBe(0)
    await client.close()
  })
})
