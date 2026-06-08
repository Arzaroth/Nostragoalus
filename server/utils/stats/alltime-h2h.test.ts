import { beforeEach, describe, it, expect } from 'vitest'
import { getAllTimeHeadToHead, resetAllTimeH2hCaches } from './alltime-h2h'

const row = (date: string, comp: string, home: [string, string], away: [string, string], hs: number | null, as: number | null) => ({
  Date: date,
  CompetitionName: [{ Description: comp }],
  HomeTeamScore: hs,
  AwayTeamScore: as,
  Home: { IdTeam: home[0], Abbreviation: home[1], TeamName: [{ Description: home[1] === 'GER' ? 'Germany' : 'Scotland' }] },
  Away: { IdTeam: away[0], Abbreviation: away[1], TeamName: [{ Description: away[1] === 'GER' ? 'Germany' : 'Scotland' }] },
})

const SEASON_ROWS = [row('2024-06-14T19:00:00Z', 'UEFA European Championship', ['43948', 'GER'], ['43967', 'SCO'], 5, 1)]
const TEAM_ROWS = [
  row('2024-06-14T19:00:00Z', 'UEFA European Championship', ['43948', 'GER'], ['43967', 'SCO'], 5, 1),
  row('2015-09-07T19:00:00Z', 'UEFA Euro Qualifier', ['43948', 'GER'], ['43967', 'SCO'], 3, 2),
  row('2014-09-07T19:00:00Z', 'Friendlies', ['43967', 'SCO'], ['43948', 'GER'], 2, 2),
  row('2013-09-07T19:00:00Z', 'Friendlies', ['43967', 'SCO'], ['43948', 'GER'], 1, 0), // SCO win
  row('2026-07-07T19:00:00Z', 'FIFA World Cup', ['43948', 'GER'], ['43967', 'SCO'], null, null), // unplayed - skipped
  row('2022-11-23T19:00:00Z', 'FIFA World Cup', ['43948', 'GER'], ['43960', 'JPN'], 1, 2), // other opponent
]

function mockFetch(failTeam = false) {
  return (async (url: string) => {
    const u = String(url)
    if (u.includes('idTeam=')) {
      if (failTeam) return new Response('down', { status: 500 })
      return new Response(JSON.stringify({ Results: TEAM_ROWS }), { status: 200 })
    }
    return new Response(JSON.stringify({ Results: SEASON_ROWS }), { status: 200 })
  }) as unknown as typeof fetch
}

beforeEach(() => resetAllTimeH2hCaches())

describe('getAllTimeHeadToHead', () => {
  it('tallies wins/draws/goals from the first code perspective, meetings newest first', async () => {
    const h2h = await getAllTimeHeadToHead('GER', 'SCO', mockFetch(), 1000)
    expect(h2h).toMatchObject({ wins: 2, draws: 1, losses: 1, goalsFor: 10, goalsAgainst: 6 })
    expect(h2h!.meetings).toHaveLength(4)
    expect(h2h!.meetings[0]).toMatchObject({ date: '2024-06-14T19:00:00Z', competition: 'UEFA European Championship', homeScore: 5 })
    expect(h2h!.meetings.at(-1)).toMatchObject({ homeTeam: 'Scotland', homeScore: 1 })
  })

  it('mirrors the perspective when only the second code resolves, caches results', async () => {
    let calls = 0
    const counting = (async (url: string) => {
      calls++
      return (mockFetch() as any)(url)
    }) as unknown as typeof fetch
    const h2h = await getAllTimeHeadToHead('XXX', 'GER', counting, 1000)
    // resolved via GER, but tallied from XXX... GER is the known side, codeA=XXX never matches a row side
    expect(h2h!.meetings.length).toBe(0)
    const before = calls
    await getAllTimeHeadToHead('XXX', 'GER', counting, 2000)
    expect(calls).toBe(before) // cached
  })

  it('returns null when nothing resolves or the calendar fails', async () => {
    const empty = (async () => new Response(JSON.stringify({ Results: [] }), { status: 200 })) as unknown as typeof fetch
    expect(await getAllTimeHeadToHead('GER', 'SCO', empty, 1000)).toBeNull()
    resetAllTimeH2hCaches()
    expect(await getAllTimeHeadToHead('GER', 'SCO', mockFetch(true), 1000)).toBeNull()
  })
})

it('covers cache reuse of the id map, sparse rows, and Results-less payloads', async () => {
  const sparse = {
    Date: null, CompetitionName: null, HomeTeamScore: 1, AwayTeamScore: 0,
    Home: { IdTeam: '43948', Abbreviation: 'GER', TeamName: null },
    Away: { IdTeam: '43967', Abbreviation: 'SCO', TeamName: null },
  }
  const fetchImpl = (async (url: string) => {
    const u = String(url)
    if (u.includes('idTeam=')) return new Response(JSON.stringify({ Results: [sparse] }), { status: 200 })
    if (u.includes('255711')) return new Response(JSON.stringify({}), { status: 200 }) // no Results key
    return new Response(JSON.stringify({ Results: SEASON_ROWS }), { status: 200 })
  }) as unknown as typeof fetch
  const h2h = await getAllTimeHeadToHead('GER', 'SCO', fetchImpl, 1000)
  expect(h2h!.meetings[0]).toMatchObject({ date: '', competition: '', homeTeam: 'GER', awayTeam: 'SCO' })
  // id map cached within the TTL: second pair resolves without refetching seasons
  const h2 = await getAllTimeHeadToHead('SCO', 'GER', fetchImpl, 2000)
  expect(h2!.wins).toBe(0) // SCO perspective: loss
  expect(h2!.losses).toBe(1)
})

it('getTeamRecentResults: last results before a date, both venues, unknown code null', async () => {
  const { getTeamRecentResults } = await import('./alltime-h2h')
  const form = await getTeamRecentResults('GER', '2024-06-15T00:00:00Z', mockFetch(), 1000)
  expect(form!.map((f) => [f.result, f.score])).toEqual([
    ['W', '5–1'], // euro opener (before the cutoff date... 2024-06-14 < 2024-06-15)
    ['L', '1–2'], // vs JPN
    ['W', '3–2'],
    ['D', '2–2'], // away at SCO
    ['L', '0–1'], // away at SCO
  ])
  expect(form![3].opponent).toBe('Scotland')
  expect(await getTeamRecentResults('XXX', '2024-01-01', mockFetch(), 1000)).toBeNull()
})

it('h2h respects the before cutoff (a past match never sees its own or later results)', async () => {
  const h2h = await getAllTimeHeadToHead('GER', 'SCO', mockFetch(), 1000, '2024-06-14T19:00:00Z')
  expect(h2h).toMatchObject({ wins: 1, draws: 1, losses: 1, goalsFor: 5, goalsAgainst: 5 }) // euro opener excluded
  expect(h2h!.meetings).toHaveLength(3)
  expect(h2h!.meetings[0].date.slice(0, 4)).toBe('2015')
})

it('covers calendar cache hits, dateless rows and fully-anonymous sides', async () => {
  const weird = {
    Date: null, CompetitionName: undefined, HomeTeamScore: 2, AwayTeamScore: 2,
    Home: { IdTeam: '43948', Abbreviation: null, TeamName: null },
    Away: { IdTeam: '43967', Abbreviation: 'SCO', TeamName: [{ Description: 'Scotland' }] },
  }
  const okRow = row('2020-01-01T19:00:00Z', 'Friendlies', ['43948', 'GER'], ['43967', 'SCO'], 1, 0)
  const fetchImpl = (async (url: string) => {
    const u = String(url)
    if (u.includes('idTeam=')) return new Response(JSON.stringify({ Results: [weird, okRow] }), { status: 200 })
    return new Response(JSON.stringify({ Results: SEASON_ROWS }), { status: 200 })
  }) as unknown as typeof fetch
  // anonymous-home row is dropped from h2h (no abbreviation match) but the ok row counts
  const h2h = await getAllTimeHeadToHead('GER', 'SCO', fetchImpl, 1000)
  expect(h2h!.meetings).toHaveLength(1)
  // form for SCO: the weird row matches via away side; null date sorts last and renders ''
  const { getTeamRecentResults } = await import('./alltime-h2h')
  const form = await getTeamRecentResults('SCO', '2024-01-01', fetchImpl, 1000)
  expect(form).toHaveLength(2)
  expect(form![1]).toMatchObject({ result: 'D', opponent: '?', date: '', competition: '' })
  // calendar cache hit: a second call within the TTL reuses rows
  const before = (h2h as any)
  const again = await getAllTimeHeadToHead('GER', 'SCO', fetchImpl, 2000)
  expect(again!.meetings).toHaveLength(1)
})
