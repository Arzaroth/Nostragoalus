// A competition in the admin competitions panel: its current TEAM_SPECIALIST
// featured team and the team codes selectable from its fixtures.
export interface AdminCompetitionDto {
  id: string
  slug: string
  name: string
  featuredTeamCode: string | null
  teams: { code: string; name: string }[]
}
