export interface StandingsInputMatch {
  homeTeam: string
  awayTeam: string
  homeTeamCode: string | null
  awayTeamCode: string | null
  status: string
  fullTimeHome: number | null
  fullTimeAway: number | null
}

export interface StandingRow {
  code: string | null
  name: string
  played: number
  won: number
  drawn: number
  lost: number
  gf: number
  ga: number
  gd: number
  points: number
}

// Compute a group table from its matches. Unplayed teams still appear (0 across),
// so the full group is shown before kickoff.
export function computeGroupStandings(matches: StandingsInputMatch[]): StandingRow[] {
  const table = new Map<string, StandingRow>()

  const ensure = (name: string, code: string | null): StandingRow => {
    let row = table.get(name)
    if (!row) {
      row = { code, name, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 }
      table.set(name, row)
    }
    return row
  }

  for (const m of matches) {
    const home = ensure(m.homeTeam, m.homeTeamCode)
    const away = ensure(m.awayTeam, m.awayTeamCode)
    if (m.status !== 'FINISHED' || m.fullTimeHome == null || m.fullTimeAway == null) continue

    home.played += 1
    away.played += 1
    home.gf += m.fullTimeHome
    home.ga += m.fullTimeAway
    away.gf += m.fullTimeAway
    away.ga += m.fullTimeHome

    if (m.fullTimeHome > m.fullTimeAway) {
      home.won += 1
      away.lost += 1
      home.points += 3
    } else if (m.fullTimeHome < m.fullTimeAway) {
      away.won += 1
      home.lost += 1
      away.points += 3
    } else {
      home.drawn += 1
      away.drawn += 1
      home.points += 1
      away.points += 1
    }
  }

  for (const row of table.values()) row.gd = row.gf - row.ga

  return [...table.values()].sort(
    (a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name),
  )
}
