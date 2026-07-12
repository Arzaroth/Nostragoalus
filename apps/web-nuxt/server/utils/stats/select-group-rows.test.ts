import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../../tests/db'
import { makeMatch, seedCompetition } from '../../../tests/factories'
import { findRoundId } from '../sync/rounds'
import { computeAllGroupStandings, selectGroupStandingsRows } from './standings'

describe('selectGroupStandingsRows', () => {
  it('returns only GROUP-stage matches, projected for the standings computation', async () => {
    const { db, client } = await createTestDb()
    const competitionId = await seedCompetition(db)
    const groupRound = (await findRoundId(db, competitionId, 'GROUP', 1)) as string
    const koRound = (await findRoundId(db, competitionId, 'R16', null)) as string

    await makeMatch(db, {
      competitionId,
      roundId: groupRound,
      kickoffTime: new Date('2026-06-15T18:00:00Z'),
      stage: 'GROUP',
      groupName: 'A',
      homeTeam: 'Spain',
      awayTeam: 'Brazil',
      homeTeamCode: 'ESP',
      awayTeamCode: 'BRA',
      status: 'FINISHED',
      fullTimeHome: 2,
      fullTimeAway: 1,
    })
    // A knockout match in the same competition must NOT appear.
    await makeMatch(db, {
      competitionId,
      roundId: koRound,
      kickoffTime: new Date('2026-07-01T18:00:00Z'),
      stage: 'R16',
      groupName: null,
      homeTeam: 'X',
      awayTeam: 'Y',
    })

    const rows = await selectGroupStandingsRows(db, competitionId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      group: 'A',
      homeTeam: 'Spain',
      awayTeam: 'Brazil',
      homeTeamCode: 'ESP',
      awayTeamCode: 'BRA',
      status: 'FINISHED',
      fullTimeHome: 2,
      fullTimeAway: 1,
    })

    // The shape feeds computeAllGroupStandings directly (the reason it's shared).
    const standings = computeAllGroupStandings(rows, { includeLive: true })
    expect(standings[0]!.group).toBe('A')
    expect(standings[0]!.rows[0]).toMatchObject({ code: 'ESP', name: 'Spain', points: 3 })
    await client.close()
  })
})
