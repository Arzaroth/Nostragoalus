import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../../db/types'
import { competition, round } from '../../../db/schema'
import { createTestDb } from '../../../tests/db'
import { makeMatch, seedCompetition } from '../../../tests/factories'
import { listCompetitionsForAdmin, setCompetitionFeaturedTeam } from './admin'

let db: AppDatabase

beforeEach(async () => {
  db = (await createTestDb()).db as unknown as AppDatabase
})

async function groupRoundId(competitionId: string): Promise<string> {
  const rows = await db.select().from(round).where(eq(round.competitionId, competitionId))
  return rows.find((r) => r.stage === 'GROUP' && r.matchday === 1)!.id
}

// A competition whose fixtures name FRA and BRA, so both are selectable teams.
async function withTeams(): Promise<string> {
  const competitionId = await seedCompetition(db)
  const g = await groupRoundId(competitionId)
  await makeMatch(db, {
    competitionId,
    roundId: g,
    stage: 'GROUP',
    status: 'SCHEDULED',
    homeTeamCode: 'FRA',
    awayTeamCode: 'BRA',
    kickoffTime: new Date('2026-06-11T12:00:00Z'),
  })
  return competitionId
}

describe('listCompetitionsForAdmin', () => {
  it('returns each competition with its featured team and selectable teams', async () => {
    const competitionId = await withTeams()
    const rows = await listCompetitionsForAdmin(db)
    const row = rows.find((r) => r.id === competitionId)!
    expect(row.featuredTeamCode).toBeNull()
    expect(row.teams.map((t) => t.code).sort()).toEqual(['BRA', 'FRA'])
  })
})

describe('setCompetitionFeaturedTeam', () => {
  it('sets a valid team, then clears it with null', async () => {
    const competitionId = await withTeams()

    await setCompetitionFeaturedTeam(db, competitionId, 'FRA')
    expect((await db.select().from(competition).where(eq(competition.id, competitionId)))[0].featuredTeamCode).toBe('FRA')

    await setCompetitionFeaturedTeam(db, competitionId, null)
    expect((await db.select().from(competition).where(eq(competition.id, competitionId)))[0].featuredTeamCode).toBeNull()
  })

  it('rejects a team that is not in the competition', async () => {
    const competitionId = await withTeams()
    await expect(setCompetitionFeaturedTeam(db, competitionId, 'XXX')).rejects.toThrow()
  })
})
