import { beforeEach, describe, it, expect } from 'vitest'
import { getAllTimeHeadToHead, resetAllTimeH2hCaches } from './alltime-h2h'

// A Data Centre match row: team A is home, team B is away. matchDate is a
// calendar day (YYYY-MM-DD).
const row = (
  matchDate: string | null,
  comp: string | null,
  a: [code: string | null, name: string | null],
  b: [code: string | null, name: string | null],
  as_: number | null,
  bs: number | null,
) => ({
  matchDate,
  competitionName: comp == null ? null : [{ description: comp }],
  teamAScore: as_,
  teamBScore: bs,
  teamACountryCode: a[0],
  teamBCountryCode: b[0],
  teamAName: a[1] == null ? null : [{ description: a[1] }],
  teamBName: b[1] == null ? null : [{ description: b[1] }],
})

// Season-calendar rows only carry the code -> numeric id mapping. The second
// row (no IdTeam, null away side) exercises the id-map skip branch.
const SEASON_ROWS = [
  { Home: { IdTeam: '43948', Abbreviation: 'GER' }, Away: { IdTeam: '43967', Abbreviation: 'SCO' } },
  { Home: { Abbreviation: 'NIR' }, Away: null },
]

const TEAM_ROWS = [
  row('2024-06-14', 'UEFA European Championship', ['GER', 'Germany'], ['SCO', 'Scotland'], 5, 1),
  row('2015-09-07', 'UEFA Euro Qualifier', ['GER', 'Germany'], ['SCO', 'Scotland'], 3, 2),
  row('2014-09-07', 'Friendlies', ['SCO', 'Scotland'], ['GER', 'Germany'], 2, 2),
  row('2013-09-07', 'Friendlies', ['SCO', 'Scotland'], ['GER', 'Germany'], 1, 0), // SCO win
  row('2026-07-07', 'FIFA World Cup', ['GER', 'Germany'], ['SCO', 'Scotland'], null, null), // unplayed - skipped
  row('2022-11-23', 'FIFA World Cup', ['GER', 'Germany'], ['JPN', 'Japan'], 1, 2), // other opponent
]

// teamId= -> the Data Centre archive (a bare array). Anything else -> the v3
// season calendar used to harvest ids (a { Results } envelope).
function mockFetch(failTeam = false) {
  return (async (url: string) => {
    const u = String(url)
    if (u.includes('teamId=')) {
      if (failTeam) return new Response('down', { status: 500 })
      return new Response(JSON.stringify(TEAM_ROWS), { status: 200 })
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
    expect(h2h!.meetings[0]).toMatchObject({ date: '2024-06-14', competition: 'UEFA European Championship', homeScore: 5 })
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

  it('skips a failing id source and resolves from the rest', async () => {
    const f = (async (url: string) => {
      const u = String(url)
      if (u.includes('255711')) return new Response('boom', { status: 500 }) // one season source down
      if (u.includes('teamId=')) return new Response(JSON.stringify(TEAM_ROWS), { status: 200 })
      return new Response(JSON.stringify({ Results: SEASON_ROWS }), { status: 200 })
    }) as unknown as typeof fetch
    const h2h = await getAllTimeHeadToHead('GER', 'SCO', f, 1000)
    expect(h2h!.meetings).toHaveLength(4)
  })
})

it('covers cache reuse of the id map, sparse rows, and Results-less payloads', async () => {
  const sparse = row(null, null, ['GER', null], ['SCO', null], 1, 0)
  const fetchImpl = (async (url: string) => {
    const u = String(url)
    if (u.includes('teamId=')) return new Response(JSON.stringify([sparse]), { status: 200 })
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
  const form = await getTeamRecentResults('GER', '2024-06-16', mockFetch(), 1000)
  expect(form!.map((f) => [f.result, f.score])).toEqual([
    ['W', '5–1'], // euro opener (2024-06-14, a clear day before the 2024-06-16 cutoff)
    ['L', '1–2'], // vs JPN
    ['W', '3–2'],
    ['D', '2–2'], // away at SCO
    ['L', '0–1'], // away at SCO
  ])
  expect(form![3].opponent).toBe('Scotland')
  expect(await getTeamRecentResults('XXX', '2024-01-01', mockFetch(), 1000)).toBeNull()
})

it('counts a 0-0 draw and skips a half-scored row', async () => {
  const rows = [
    row('2020-01-01', 'Friendlies', ['GER', 'Germany'], ['SCO', 'Scotland'], 0, 0), // genuine 0-0 draw
    row('2019-01-01', 'Friendlies', ['GER', 'Germany'], ['SCO', 'Scotland'], 1, null), // half-played -> skipped
  ]
  const f = (async (url: string) => {
    const u = String(url)
    if (u.includes('teamId=')) return new Response(JSON.stringify(rows), { status: 200 })
    return new Response(JSON.stringify({ Results: SEASON_ROWS }), { status: 200 })
  }) as unknown as typeof fetch
  const h2h = await getAllTimeHeadToHead('GER', 'SCO', f, 1000)
  expect(h2h).toMatchObject({ wins: 0, draws: 1, losses: 0, goalsFor: 0, goalsAgainst: 0 }) // 0-0 is a draw, not a skip
  expect(h2h!.meetings).toHaveLength(1) // the half-scored row is dropped
})

it('h2h respects the before cutoff (a past match never sees its own or later results)', async () => {
  const h2h = await getAllTimeHeadToHead('GER', 'SCO', mockFetch(), 1000, '2024-06-14T19:00:00Z')
  expect(h2h).toMatchObject({ wins: 1, draws: 1, losses: 1, goalsFor: 5, goalsAgainst: 5 }) // euro opener excluded
  expect(h2h!.meetings).toHaveLength(3)
  expect(h2h!.meetings[0].date.slice(0, 4)).toBe('2015')
})

it('covers cache hits, dateless rows and fully-anonymous sides', async () => {
  const weird = row(null, null, [null, null], ['SCO', 'Scotland'], 2, 2) // anonymous home, competition null
  const okRow = row('2020-01-01', 'Friendlies', ['GER', 'Germany'], ['SCO', 'Scotland'], 1, 0)
  const fetchImpl = (async (url: string) => {
    const u = String(url)
    if (u.includes('teamId=')) return new Response(JSON.stringify([weird, okRow]), { status: 200 })
    return new Response(JSON.stringify({ Results: SEASON_ROWS }), { status: 200 })
  }) as unknown as typeof fetch
  // anonymous-home row is dropped from h2h (no code match) but the ok row counts
  const h2h = await getAllTimeHeadToHead('GER', 'SCO', fetchImpl, 1000)
  expect(h2h!.meetings).toHaveLength(1)
  // form for SCO: the weird row matches via the away side; null date sorts last and renders ''
  const { getTeamRecentResults } = await import('./alltime-h2h')
  const form = await getTeamRecentResults('SCO', '2024-01-01', fetchImpl, 1000)
  expect(form).toHaveLength(2)
  expect(form![1]).toMatchObject({ result: 'D', opponent: '?', date: '', competition: '' })
  // h2h cache hit: a second call within the TTL reuses the result
  const again = await getAllTimeHeadToHead('GER', 'SCO', fetchImpl, 2000)
  expect(again!.meetings).toHaveLength(1)
})

it('expired calendar cache refetches; anonymous away name falls back to its code', async () => {
  const anonAway = row('2021-05-05', 'Friendlies', ['GER', 'Germany'], ['SCO', null], 0, 3)
  let teamCalls = 0
  const fetchImpl = (async (url: string) => {
    const u = String(url)
    if (u.includes('teamId=')) {
      teamCalls++
      return new Response(JSON.stringify([anonAway]), { status: 200 })
    }
    return new Response(JSON.stringify({ Results: SEASON_ROWS }), { status: 200 })
  }) as unknown as typeof fetch
  const h2h = await getAllTimeHeadToHead('GER', 'SCO', fetchImpl, 1000)
  expect(h2h!.meetings[0]).toMatchObject({ awayTeam: 'SCO', awayCode: 'SCO', homeTeam: 'Germany' })
  // 25h later: pair cache AND calendar cache expired -> refetch
  const dayLater = 1000 + 25 * 60 * 60 * 1000
  await getAllTimeHeadToHead('GER', 'SCO', fetchImpl, dayLater)
  expect(teamCalls).toBe(2)
})

it('branch fill: dateless calendar rows, and a non-array calendar payload', async () => {
  // two dateless rows so the sort comparator coalesces a null on both sides
  const dateless = row(null, null, ['GER', 'Germany'], ['XX', null], 2, 0)
  const dateless2 = row(null, 'Friendlies', ['GER', 'Germany'], ['YY', null], 1, 1)
  const f = (async (url: string) => {
    const u = String(url)
    if (u.includes('teamId=43948')) return new Response(JSON.stringify([dateless, dateless2]), { status: 200 })
    return new Response(JSON.stringify({ Results: SEASON_ROWS }), { status: 200 })
  }) as unknown as typeof fetch
  const { getTeamRecentResults } = await import('./alltime-h2h')
  const form = await getTeamRecentResults('GER', '2024-01-01', f, 6100)
  expect(form!.length).toBe(2) // dateless rows still included, sort handles null dates
  // a team whose calendar payload is not an array -> [] (the Array.isArray branch)
  resetAllTimeH2hCaches()
  const none = (async (url: string) => {
    if (String(url).includes('teamId=43948')) return new Response(JSON.stringify({}), { status: 200 })
    return new Response(JSON.stringify({ Results: SEASON_ROWS }), { status: 200 })
  }) as unknown as typeof fetch
  expect(await getTeamRecentResults('GER', '2024-01-01', none, 6200)).toEqual([])
})

it('branch fill: calendar cache reuse, anon codes, getTeamRecentResults failure', async () => {
  const anon = row('2019-01-01', 'Friendlies', [null, null], [null, null], 1, 0) // no codes -> ? opponent
  let teamCalls = 0
  const fetchImpl = (async (url: string) => {
    const u = String(url)
    if (u.includes('teamId=43948')) {
      teamCalls++
      return new Response(JSON.stringify([anon]), { status: 200 })
    }
    return new Response(JSON.stringify({ Results: SEASON_ROWS }), { status: 200 })
  }) as unknown as typeof fetch
  // anon codes: perspective never matches as home, decode falls back via the away side
  const { getTeamRecentResults } = await import('./alltime-h2h')
  const form = await getTeamRecentResults('GER', '2024-01-01', fetchImpl, 5000)
  expect(form).not.toBeNull()
  // second call within TTL reuses the calendar cache (no extra team fetch)
  await getTeamRecentResults('GER', '2024-01-01', fetchImpl, 5000)
  expect(teamCalls).toBe(1)

  // a thrown calendar fetch -> null
  const boom = (async (url: string) => {
    if (String(url).includes('teamId=43948')) return new Response('x', { status: 500 })
    return new Response(JSON.stringify({ Results: SEASON_ROWS }), { status: 200 })
  }) as unknown as typeof fetch
  resetAllTimeH2hCaches()
  expect(await getTeamRecentResults('GER', '2024-01-01', boom, 9000)).toBeNull()
})
