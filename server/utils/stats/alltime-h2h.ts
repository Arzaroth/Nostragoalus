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

type FifaSide = NonNullable<FifaCalendarRow['Home']>
const sideName = (s: FifaSide | null | undefined) => s?.TeamName?.[0]?.Description ?? s?.Abbreviation ?? '?'

// A row of a match that was actually played (both scores present). The type
// guard narrows so the decode helpers never need a `?? 0` on the scores.
type PlayedRow = FifaCalendarRow & { HomeTeamScore: number; AwayTeamScore: number }
const isPlayed = (m: FifaCalendarRow): m is PlayedRow => m.HomeTeamScore != null && m.AwayTeamScore != null

// Decode a played row from one team's perspective.
function rowFromPerspective(m: PlayedRow, code: string) {
  const isHome = m.Home?.Abbreviation === code
  const forGoals = isHome ? m.HomeTeamScore : m.AwayTeamScore
  const against = isHome ? m.AwayTeamScore : m.HomeTeamScore
  return {
    isHome,
    forGoals,
    against,
    result: (forGoals > against ? 'W' : forGoals < against ? 'L' : 'D') as 'W' | 'D' | 'L',
    opponentName: sideName(isHome ? m.Away : m.Home),
    competition: m.CompetitionName?.[0]?.Description ?? '',
    date: m.Date ?? '',
  }
}

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
const calendarCache = new Map<string, Cache<FifaCalendarRow[]>>()

export function resetAllTimeH2hCaches() {
  idMapCache = null
  h2hCache.clear()
  calendarCache.clear()
}

async function teamCalendar(teamId: string, fetchImpl: typeof fetch, now: number): Promise<FifaCalendarRow[]> {
  const cached = calendarCache.get(teamId)
  if (cached && now - cached.at < DAY_MS) return cached.value
  const data = await getJson<{ Results?: FifaCalendarRow[] }>(
    `${BASE_URL}/calendar/matches?idTeam=${teamId}&language=en&count=500`,
    fetchImpl,
  )
  const rows = data.Results ?? []
  calendarCache.set(teamId, { at: now, value: rows })
  return rows
}

export interface AllTimeFormEntry {
  result: 'W' | 'D' | 'L'
  opponent: string
  score: string
  date: string
  competition: string
}

// The team's last N results across ALL international football before a date -
// not just inside one of our competitions.
export async function getTeamRecentResults(
  code: string,
  before: string,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
  count = 5,
): Promise<AllTimeFormEntry[] | null> {
  try {
    const ids = await teamIdMap(fetchImpl, now)
    const teamId = ids.get(code)
    if (!teamId) return null
    const rows = (await teamCalendar(teamId, fetchImpl, now))
      .filter(isPlayed)
      .filter((m) => (m.Date ?? '') < before)
      .sort((a, b) => (b.Date ?? '').localeCompare(a.Date ?? ''))
      .slice(0, count)
    return rows.map((m) => {
      const v = rowFromPerspective(m, code)
      return {
        result: v.result,
        opponent: v.opponentName,
        score: `${v.forGoals}–${v.against}`,
        date: v.date,
        competition: v.competition,
      }
    })
  } catch {
    return null
  }
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
  // Only meetings strictly before this instant count - when looking at a past
  // match, its own result and anything later must not color the history.
  before = '9999',
): Promise<AllTimeH2H | null> {
  const key = [codeA, codeB, before].join('|')
  const cached = h2hCache.get(key)
  if (cached && now - cached.at < DAY_MS) return cached.value

  let result: AllTimeH2H | null = null
  try {
    const ids = await teamIdMap(fetchImpl, now)
    const teamId = ids.get(codeA) ?? ids.get(codeB)
    const perspective = ids.get(codeA) ? codeA : codeB
    if (teamId) {
      const opponent = perspective === codeA ? codeB : codeA
      const rows = (await teamCalendar(teamId, fetchImpl, now))
        .filter(isPlayed)
        .filter(
          (m) =>
            (m.Date ?? '') < before &&
            ((m.Home?.Abbreviation === perspective && m.Away?.Abbreviation === opponent) ||
              (m.Home?.Abbreviation === opponent && m.Away?.Abbreviation === perspective)),
        )
      const h2h: AllTimeH2H = { wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, meetings: [] }
      for (const m of rows) {
        const v = rowFromPerspective(m, codeA)
        h2h.goalsFor += v.forGoals
        h2h.goalsAgainst += v.against
        if (v.result === 'W') h2h.wins++
        else if (v.result === 'L') h2h.losses++
        else h2h.draws++
        h2h.meetings.push({
          date: v.date,
          competition: v.competition,
          homeTeam: sideName(m.Home),
          awayTeam: sideName(m.Away),
          homeCode: m.Home?.Abbreviation ?? null,
          awayCode: m.Away?.Abbreviation ?? null,
          homeScore: m.HomeTeamScore,
          awayScore: m.AwayTeamScore,
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
