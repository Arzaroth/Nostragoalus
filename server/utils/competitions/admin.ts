import type { AppDatabase } from '../../../db/types'
import type { AdminCompetitionDto } from '#shared/types/admin-competitions'
import { listCompetitions, setFeaturedTeamCode } from './store'
import { listCompetitionTeams } from '../champion/service'
import { NotFoundError } from '../errors'

export async function listCompetitionsForAdmin(db: AppDatabase): Promise<AdminCompetitionDto[]> {
  const comps = await listCompetitions(db)
  const out: AdminCompetitionDto[] = []
  for (const c of comps) {
    out.push({
      id: c.id,
      slug: c.slug,
      name: c.name,
      featuredTeamCode: c.featuredTeamCode,
      teams: await listCompetitionTeams(db, c.id),
    })
  }
  return out
}

// Set (or clear, with null) a competition's featured team by id. Rejects a code
// that isn't one of the competition's teams so the prize can always resolve.
export async function setCompetitionFeaturedTeam(db: AppDatabase, competitionId: string, code: string | null): Promise<void> {
  const teams = await listCompetitionTeams(db, competitionId)
  if (code !== null && !teams.some((t) => t.code === code)) {
    throw new NotFoundError('team not in competition')
  }
  await setFeaturedTeamCode(db, competitionId, code)
}
