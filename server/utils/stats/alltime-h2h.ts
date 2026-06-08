// All-time head-to-head from FIFA's public calendar, which records every
// international match (World Cups, qualifiers, continental championships,
// friendlies) back to 1908. Team-based, so it works before kickoff too.

export interface AllTimeMeeting {
  date: string
  competition: string
  homeTeam: string
  awayTeam: string
  homeCode: string | null
  awayCode: string | null
  homeScore: number
  awayScore: number
}

// From the first team's perspective.
export interface AllTimeH2H {
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  meetings: AllTimeMeeting[]
}

interface FifaCalendarRow {
  Date?: string | null
  CompetitionName?: { Description?: string }[] | null
  HomeTeamScore?: number | null
  AwayTeamScore?: number | null
  Home?: { IdTeam?: string | null; Abbreviation?: string | null; TeamName?: { Description?: string }[] | null } | null
  Away?: { IdTeam?: string | null; Abbreviation?: string | null; TeamName?: { Description?: string }[] | null } | null
}

const BASE_URL = 'https://api.fifa.com/api/v3'

// Senior team ids are not searchable; harvest them from season calendars that
// jointly cover every team we track (the Euro lives in FIFA's calendar too).
const ID_SOURCES = [
  'idSeason=285023', // World Cup 2026
  'idSeason=255711', // World Cup 2022
  'idCompetition=8tddm56zbasf57jkkay4kbf11&idSeason=4lp7vq583c95jwjhaohqbl9g4', // UEFA Euro 2024
]

const DAY_MS = 24 * 60 * 60 * 1000

interface Cache<T> {
  at: number
  value: T
}

let idMapCache: Cache<Map<string, string>> | null = null
const h2hCache = new Map<string, Cache<AllTimeH2H | null>>()

export function resetAllTimeH2hCaches() {
  idMapCache = null
  h2hCache.clear()
}

async function getJson<T>(url: string, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(url, { headers: { 'user-agent': 'Mozilla/5.0' } })
  if (!res.ok) throw new Error(`fifa calendar ${res.status}`)
  return (await res.json()) as T
}

async function teamIdMap(fetchImpl: typeof fetch, now: number): Promise<Map<string, string>> {
  if (idMapCache && now - idMapCache.at < DAY_MS) return idMapCache.value
  const map = new Map<string, string>()
  for (const source of ID_SOURCES) {
    try {
      const data = await getJson<{ Results?: FifaCalendarRow[] }>(
        `${BASE_URL}/calendar/matches?${source}&language=en&count=500`,
        fetchImpl,
      )
      for (const m of data.Results ?? []) {
        for (const side of [m.Home, m.Away]) {
          if (side?.Abbreviation && side.IdTeam) map.set(side.Abbreviation, side.IdTeam)
        }
      }
    } catch {
      // a missing source shrinks coverage, it doesn't break the others
    }
  }
  idMapCache = { at: now, value: map }
  return map
}

export async function getAllTimeHeadToHead(
  codeA: string,
  codeB: string,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<AllTimeH2H | null> {
  const key = [codeA, codeB].join('|')
  const cached = h2hCache.get(key)
  if (cached && now - cached.at < DAY_MS) return cached.value

  let result: AllTimeH2H | null = null
  try {
    const ids = await teamIdMap(fetchImpl, now)
    const teamId = ids.get(codeA) ?? ids.get(codeB)
    const perspective = ids.get(codeA) ? codeA : codeB
    if (teamId) {
      const data = await getJson<{ Results?: FifaCalendarRow[] }>(
        `${BASE_URL}/calendar/matches?idTeam=${teamId}&language=en&count=500`,
        fetchImpl,
      )
      const opponent = perspective === codeA ? codeB : codeA
      const rows = (data.Results ?? []).filter(
        (m) =>
          m.HomeTeamScore != null &&
          m.AwayTeamScore != null &&
          ((m.Home?.Abbreviation === perspective && m.Away?.Abbreviation === opponent) ||
            (m.Home?.Abbreviation === opponent && m.Away?.Abbreviation === perspective)),
      )
      const h2h: AllTimeH2H = { wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, meetings: [] }
      for (const m of rows) {
        const aIsHome = m.Home?.Abbreviation === codeA
        const forA = aIsHome ? (m.HomeTeamScore as number) : (m.AwayTeamScore as number)
        const against = aIsHome ? (m.AwayTeamScore as number) : (m.HomeTeamScore as number)
        h2h.goalsFor += forA
        h2h.goalsAgainst += against
        if (forA > against) h2h.wins++
        else if (forA < against) h2h.losses++
        else h2h.draws++
        h2h.meetings.push({
          date: m.Date ?? '',
          competition: m.CompetitionName?.[0]?.Description ?? '',
          homeTeam: m.Home?.TeamName?.[0]?.Description ?? m.Home?.Abbreviation ?? '?',
          awayTeam: m.Away?.TeamName?.[0]?.Description ?? m.Away?.Abbreviation ?? '?',
          homeCode: m.Home?.Abbreviation ?? null,
          awayCode: m.Away?.Abbreviation ?? null,
          homeScore: m.HomeTeamScore as number,
          awayScore: m.AwayTeamScore as number,
        })
      }
      h2h.meetings.sort((a, b) => b.date.localeCompare(a.date))
      result = h2h
    }
  } catch {
    result = null
  }
  h2hCache.set(key, { at: now, value: result })
  return result
}
