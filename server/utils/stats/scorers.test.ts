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

    const top = await getCompetitionTopScorers(db, competitionId)
    expect(top[0]).toMatchObject({ playerName: 'Mbappe', goals: 2, assists: 0 })
    expect(top[1]).toMatchObject({ playerName: 'Griezmann', goals: 1, assists: 1 })
    expect(top.find((s) => s.playerName === 'OwnGoalGuy')).toBeUndefined()
    await client.close()
  })
})
