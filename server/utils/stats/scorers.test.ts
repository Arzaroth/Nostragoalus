import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { seedCompetition, makeMatch } from '../../../tests/factories'
import { findRoundId } from '../sync/rounds'
import { getCompetitionTopScorers } from './scorers'
import { goalEvent } from '../../../db/schema'
import type { AppDatabase } from '../../../db/types'

async function addGoal(db: AppDatabase, competitionId: string, matchId: string, o: Record<string, unknown>) {
  await db.insert(goalEvent).values({
    matchId,
    competitionId,
    side: 'HOME',
    teamName: 'T',
    teamCode: 'T',
    playerName: 'P',
    ownGoal: false,
    ...o,
  })
}

describe('getCompetitionTopScorers', () => {
  it('aggregates goals (excluding own goals) plus assists, sorted', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const md1 = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const mid = await makeMatch(db, { competitionId, roundId: md1, kickoffTime: new Date('2026-06-11T16:00:00Z') })

    await addGoal(db, competitionId, mid, { playerId: 'p1', playerName: 'Mbappe', teamCode: 'FRA', assistPlayerId: 'p2' })
    await addGoal(db, competitionId, mid, { playerId: 'p1', playerName: 'Mbappe', teamCode: 'FRA' })
    await addGoal(db, competitionId, mid, { playerId: 'p2', playerName: 'Griezmann', teamCode: 'FRA' })
    await addGoal(db, competitionId, mid, { playerId: 'p3', playerName: 'OwnGoalGuy', teamCode: 'XXX', ownGoal: true })
    await addGoal(db, competitionId, mid, { playerId: 'p4', playerName: 'Aaa', teamCode: 'AAA' })
    await addGoal(db, competitionId, mid, { playerId: 'p5', playerName: 'Zzz', teamCode: 'ZZZ' })

    const top = await getCompetitionTopScorers(db, competitionId)
    expect(top[0]).toMatchObject({ playerName: 'Mbappe', goals: 2, assists: 0 })
    expect(top.find((s) => s.playerName === 'OwnGoalGuy')).toBeUndefined()
    const names = top.map((s) => s.playerName)
    // 1 goal each: Griezmann (1 assist) ranks above Aaa/Zzz (assists tie-break),
    // then Aaa before Zzz (name tie-break).
    expect(names.indexOf('Griezmann')).toBeLessThan(names.indexOf('Aaa'))
    expect(names.indexOf('Aaa')).toBeLessThan(names.indexOf('Zzz'))
    await client.close()
  })

  it('ranks a pure assister (no goals) on the scoring team', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const md1 = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const mid = await makeMatch(db, { competitionId, roundId: md1, kickoffTime: new Date('2026-06-11T16:00:00Z') })

    // Mbappe scores twice, Olise assists both but never scores himself.
    await addGoal(db, competitionId, mid, { playerId: 'm', playerName: 'Mbappe', teamName: 'France', teamCode: 'FRA', assistPlayerId: 'o', assistPlayerName: 'Olise' })
    await addGoal(db, competitionId, mid, { playerId: 'm', playerName: 'Mbappe', teamName: 'France', teamCode: 'FRA', assistPlayerId: 'o', assistPlayerName: 'Olise' })

    const top = await getCompetitionTopScorers(db, competitionId)
    const olise = top.find((s) => s.playerName === 'Olise')
    expect(olise).toMatchObject({ goals: 0, assists: 2, teamCode: 'FRA', teamName: 'France' })
    await client.close()
  })
})
