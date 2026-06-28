import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { seedCompetition, makeMatch } from '../../../tests/factories'
import { findRoundId } from '../sync/rounds'
import { getCompetitionPlayerRankings, getCompetitionTopScorers, rankPlayers } from './scorers'
import { goalEvent } from '../../../db/schema'
import type { AppDatabase } from '../../../db/types'
import type { TopScorer } from '../../../shared/types/match'

const player = (o: Partial<TopScorer> & { playerName: string }): TopScorer => ({
  teamName: 'T',
  teamCode: 'T',
  goals: 0,
  assists: 0,
  penalties: null,
  ...o,
})

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

describe('rankPlayers', () => {
  it('ranks scorers and assists on independent metrics', () => {
    const players = [
      player({ playerName: 'Striker', goals: 5, assists: 0 }),
      player({ playerName: 'Dual', goals: 3, assists: 1 }),
      player({ playerName: 'Playmaker', goals: 0, assists: 9 }),
    ]
    const { scorers, assists } = rankPlayers(players)
    // Goals board: scorers only, Playmaker (0 goals) dropped.
    expect(scorers.map((s) => s.playerName)).toEqual(['Striker', 'Dual'])
    // Assists board led by Playmaker even though he never scored.
    expect(assists.map((s) => s.playerName)).toEqual(['Playmaker', 'Dual'])
  })

  it('slices each board to its own limit so a low-goal assister still surfaces', () => {
    const players = [
      player({ playerName: 'Striker A', goals: 5 }),
      player({ playerName: 'Striker B', goals: 4 }),
      player({ playerName: 'Setup King', goals: 1, assists: 7 }),
    ]
    const { scorers, assists } = rankPlayers(players, 2)
    // The assist leader is outside the goals top-2 yet tops his own board.
    expect(scorers.map((s) => s.playerName)).toEqual(['Striker A', 'Striker B'])
    expect(assists[0].playerName).toBe('Setup King')
  })

  it('treats null assists as zero and drops them from the assist board', () => {
    const { assists } = rankPlayers([player({ playerName: 'Goal Only', goals: 2, assists: null })])
    expect(assists).toEqual([])
  })
})

describe('getCompetitionPlayerRankings', () => {
  it('returns both boards, with a pure assister leading assists', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const md1 = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const mid = await makeMatch(db, { competitionId, roundId: md1, kickoffTime: new Date('2026-06-11T16:00:00Z') })

    // Setup never scores but assists three goals; the scorer assists nothing.
    await addGoal(db, competitionId, mid, { playerId: 's', playerName: 'Scorer', assistPlayerId: 'a', assistPlayerName: 'Setup' })
    await addGoal(db, competitionId, mid, { playerId: 's', playerName: 'Scorer', assistPlayerId: 'a', assistPlayerName: 'Setup' })
    await addGoal(db, competitionId, mid, { playerId: 's', playerName: 'Scorer', assistPlayerId: 'a', assistPlayerName: 'Setup' })

    const { scorers, assists } = await getCompetitionPlayerRankings(db, competitionId)
    expect(scorers.map((s) => s.playerName)).toEqual(['Scorer'])
    expect(assists[0]).toMatchObject({ playerName: 'Setup', goals: 0, assists: 3 })
    await client.close()
  })
})
