// All-time head-to-head from FIFA's public Data Centre archive, which records
// every senior men's international (World Cups, qualifiers, continental
// championships AND friendlies) back to the early 1900s. The older v3 calendar
// endpoint only carried FIFA-organised competitions plus friendlies since ~2021,
// so historic friendlies (e.g. Norway-France 2010, 2014) were silently missing.
// Team-based, so it works before kickoff too.

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

// A Data Centre match row. Team A is home, team B is away.
interface DataCentreRow {
  matchDate?: string | null
  competitionName?: { description?: string }[] | null
  teamAScore?: number | null
  teamBScore?: number | null
  teamACountryCode?: string | null
  teamBCountryCode?: string | null
  teamAName?: { description?: string }[] | null
  teamBName?: { description?: string }[] | null
}

// A season-calendar row, used only to harvest team ids (the Data Centre archive
// is queried by numeric team id, which is not otherwise searchable).
interface FifaSeasonRow {
  Home?: { IdTeam?: string | null; Abbreviation?: string | null } | null
  Away?: { IdTeam?: string | null; Abbreviation?: string | null } | null
}

const V3_URL = 'https://api.fifa.com/api/v3'
const DATA_CENTRE_URL = 'https://inside.fifa.com/api/data-centre/matches'

const nameOf = (name: { description?: string }[] | null | undefined, code: string | null | undefined) =>
  name?.[0]?.description ?? code ?? '?'

// A row of a match that was actually played (both scores present). The type
// guard narrows so the decode helpers never need a `?? 0` on the scores.
type PlayedRow = DataCentreRow & { teamAScore: number; teamBScore: number }
const isPlayed = (m: DataCentreRow): m is PlayedRow => m.teamAScore != null && m.teamBScore != null

// Decode a played row from one team's perspective.
function rowFromPerspective(m: PlayedRow, code: string) {
  const isHome = m.teamACountryCode === code
  const forGoals = isHome ? m.teamAScore : m.teamBScore
  const against = isHome ? m.teamBScore : m.teamAScore
  return {
    isHome,
    forGoals,
    against,
    result: (forGoals > against ? 'W' : forGoals < against ? 'L' : 'D') as 'W' | 'D' | 'L',
    opponentName: isHome ? nameOf(m.teamBName, m.teamBCountryCode) : nameOf(m.teamAName, m.teamACountryCode),
    competition: m.competitionName?.[0]?.description ?? '',
    date: m.matchDate ?? '',
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
const calendarCache = new Map<string, Cache<DataCentreRow[]>>()

export function resetAllTimeH2hCaches() {
  idMapCache = null
  h2hCache.clear()
  calendarCache.clear()
}

async function teamCalendar(teamId: string, fetchImpl: typeof fetch, now: number): Promise<DataCentreRow[]> {
  const cached = calendarCache.get(teamId)
  if (cached && now - cached.at < DAY_MS) return cached.value
  // The archive caps a response at 1000 rows, newest first; that drops only the
  // pre-1920s tail for the few nations with >1000 caps - irrelevant to h2h.
  const data = await getJson<DataCentreRow[]>(
    `${DATA_CENTRE_URL}?gender=1&teamId=${teamId}&language=en&count=1000`,
    fetchImpl,
  )
  const rows = Array.isArray(data) ? data : []
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
    // matchDate is a calendar day (YYYY-MM-DD); compare against the day of the
    // cutoff so a same-day match (the one being viewed) is never counted.
    const day = before.slice(0, 10)
    const rows = (await teamCalendar(teamId, fetchImpl, now))
      .filter(isPlayed)
      .filter((m) => (m.matchDate ?? '') < day)
      .sort((a, b) => (b.matchDate ?? '').localeCompare(a.matchDate ?? ''))
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
  const res = await fetchImpl(url, {
    headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' },
  })
  if (!res.ok) throw new Error(`fifa fetch ${res.status}`)
  return (await res.json()) as T
}

async function teamIdMap(fetchImpl: typeof fetch, now: number): Promise<Map<string, string>> {
  if (idMapCache && now - idMapCache.at < DAY_MS) return idMapCache.value
  const map = new Map<string, string>()
  for (const source of ID_SOURCES) {
    try {
      const data = await getJson<{ Results?: FifaSeasonRow[] }>(
        `${V3_URL}/calendar/matches?${source}&language=en&count=500`,
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
      // matchDate is a calendar day; compare against the cutoff's day so the
      // viewed match (same day) never shows up in its own history.
      const day = before.slice(0, 10)
      const rows = (await teamCalendar(teamId, fetchImpl, now))
        .filter(isPlayed)
        .filter(
          (m) =>
            (m.matchDate ?? '') < day &&
            ((m.teamACountryCode === perspective && m.teamBCountryCode === opponent) ||
              (m.teamACountryCode === opponent && m.teamBCountryCode === perspective)),
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
          homeTeam: nameOf(m.teamAName, m.teamACountryCode),
          awayTeam: nameOf(m.teamBName, m.teamBCountryCode),
          homeCode: m.teamACountryCode ?? null,
          awayCode: m.teamBCountryCode ?? null,
          homeScore: m.teamAScore,
          awayScore: m.teamBScore,
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
