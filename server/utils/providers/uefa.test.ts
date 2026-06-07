import { describe, it, expect } from 'vitest'
import { mapUefaStage, mapUefaStatus, normalizeUefaMatch, uefaProvider, type UefaMatch } from './uefa'
import { RateLimiter } from './rate-limiter'

const baseMatch = (over: Partial<UefaMatch> = {}): UefaMatch => ({
  id: 'm1',
  status: 'FINISHED',
  kickOffTime: { dateTime: '2024-07-14T19:00:00Z' },
  homeTeam: { id: '122', internationalName: 'Spain', countryCode: 'ESP', bigLogoUrl: 'esp.png' },
  awayTeam: { id: '39', internationalName: 'England', countryCode: 'ENG', bigLogoUrl: 'eng.png' },
  score: { total: { home: 2, away: 1 } },
  round: { id: 'r1', metaData: { name: 'Final' } },
  matchday: { name: 'MD7', phase: 'TOURNAMENT' },
  winner: { match: { team: { id: '122' } } },
  ...over,
})

describe('uefa mapping', () => {
  it('maps statuses and stages ("Final tournament" is the group stage)', () => {
    expect(mapUefaStatus('FINISHED')).toBe('FINISHED')
    expect(mapUefaStatus('LIVE')).toBe('LIVE')
    expect(mapUefaStatus('HALF_TIME_BREAK')).toBe('PAUSED')
    expect(mapUefaStatus('UPCOMING')).toBe('SCHEDULED')
    expect(mapUefaStage('Final tournament')).toBe('GROUP')
    expect(mapUefaStage('Final')).toBe('FINAL')
    expect(mapUefaStage('Round of 16')).toBe('R16')
    expect(mapUefaStage('Round of 32')).toBe('R32')
    expect(mapUefaStage('Quarter-finals')).toBe('QF')
    expect(mapUefaStage('Semi-finals')).toBe('SF')
    expect(mapUefaStage('Third place')).toBe('THIRD_PLACE')
    expect(mapUefaStage(undefined)).toBe('GROUP')
  })

  it('normalizes the final: total score, winner, no pens object without a shootout', () => {
    const n = normalizeUefaMatch(baseMatch())
    expect(n).toMatchObject({
      providerMatchId: 'm1',
      stage: 'FINAL',
      group: null,
      matchday: null,
      status: 'FINISHED',
      winner: 'HOME',
      kickoffTime: '2024-07-14T19:00:00Z',
    })
    expect(n.homeTeam).toMatchObject({ name: 'Spain', code: 'ESP', providerTeamId: '122' })
    expect(n.score.fullTime).toEqual({ home: 2, away: 1 })
    expect(n.score.penalties).toBeUndefined()
  })

  it('keeps real shootouts, parses group letters and matchdays, detects draws and away winners', () => {
    const pens = normalizeUefaMatch(baseMatch({
      score: { total: { home: 0, away: 0 }, penalty: { home: 3, away: 0 } },
      winner: { match: { team: { id: '39' } } },
      round: { id: 'r2', metaData: { name: 'Round of 16' } },
    }))
    expect(pens.score.penalties).toEqual({ home: 3, away: 0 })
    expect(pens.winner).toBe('AWAY')

    const grp = normalizeUefaMatch(baseMatch({
      round: { id: 'r3', metaData: { name: 'Final tournament' } },
      group: { metaData: { groupName: 'Group F' } },
      matchday: { name: 'MD3', phase: 'TOURNAMENT' },
      score: { total: { home: 1, away: 1 }, penalty: { home: 0, away: 0 } },
      winner: null,
    }))
    expect(grp).toMatchObject({ stage: 'GROUP', group: 'F', matchday: 3, winner: 'DRAW' })
    expect(grp.score.penalties).toBeUndefined() // 0-0 pens artifact suppressed at the source

    const tbd = normalizeUefaMatch(baseMatch({ homeTeam: null, score: null, winner: null, kickOffTime: null }))
    expect(tbd.homeTeam.name).toBe('TBD')
    expect(tbd.winner).toBeNull()
  })
})

describe('uefaProvider', () => {
  const noWait = () => new RateLimiter(0)

  it('pages through results and filters out qualifying play-offs', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) =>
      baseMatch({ id: `t${i}`, matchday: { name: 'MD1', phase: i % 2 ? 'TOURNAMENT' : 'QUALIFYING' } }))
    const page2 = [baseMatch({ id: 'last' })]
    const pages = [page1, page2]
    const urls: string[] = []
    const fetchImpl = (async (url: string) => {
      urls.push(String(url))
      return new Response(JSON.stringify(pages.shift() ?? []), { status: 200 })
    }) as unknown as typeof fetch
    const provider = uefaProvider({ seasonYear: '2024', rateLimiter: noWait(), fetchImpl })
    const fixtures = await provider.listFixtures({ season: '2024' })
    expect(fixtures).toHaveLength(51) // 50 tournament-phase from page1 + 1 from page2
    expect(urls[0]).toContain('competitionId=3')
    expect(urls[1]).toContain('offset=100')
  })

  it('getMatchesByDate and getLiveMatches filter the fixture list', async () => {
    const data = [
      baseMatch({ id: 'a', status: 'LIVE', kickOffTime: { dateTime: '2024-06-20T19:00:00Z' } }),
      baseMatch({ id: 'b', status: 'FINISHED' }),
    ]
    const fetchImpl = (async () => new Response(JSON.stringify(data), { status: 200 })) as unknown as typeof fetch
    const provider = uefaProvider({ seasonYear: '2024', rateLimiter: noWait(), fetchImpl })
    expect(await provider.getMatchesByDate('2024-06-20')).toHaveLength(1)
    expect((await provider.getLiveMatches()).map((m) => m.providerMatchId)).toEqual(['a'])
  })

  it('surfaces rate limits and upstream errors', async () => {
    const limited = uefaProvider({ seasonYear: '2024', rateLimiter: noWait(), fetchImpl: (async () => new Response('', { status: 429 })) as unknown as typeof fetch })
    await expect(limited.listFixtures({ season: '2024' })).rejects.toThrow()
    const broken = uefaProvider({ seasonYear: '2024', rateLimiter: noWait(), fetchImpl: (async () => new Response('x', { status: 500 })) as unknown as typeof fetch })
    await expect(broken.listFixtures({ season: '2024' })).rejects.toThrow()
  })
})

describe('uefa edge branches', () => {
  it('pens with one null side, malformed group name, winner id matching nobody', () => {
    const n = normalizeUefaMatch(baseMatch({
      score: { total: { home: 1, away: 0 }, penalty: { home: 4, away: null } },
      group: { metaData: { groupName: 'Mystery Zone 9' } },
      round: { id: 'rX', metaData: { name: 'Final tournament' } },
      matchday: { name: 'weird', phase: 'TOURNAMENT' },
      winner: { match: { team: { id: 'nobody' } } },
    }))
    expect(n.score.penalties).toEqual({ home: 4, away: null })
    expect(n.group).toBeNull() // no trailing letter
    expect(n.matchday).toBeNull() // unparsable MD name
    expect(n.winner).toBeNull() // unknown winner id, not a draw
  })

  it('explicit baseUrl and competitionId are honored', async () => {
    let url = ''
    const fetchImpl = (async (u: string) => {
      url = String(u)
      return new Response('[]', { status: 200 })
    }) as unknown as typeof fetch
    const provider = uefaProvider({ seasonYear: '2024', competitionId: '99', baseUrl: 'https://example.test', rateLimiter: new RateLimiter(0), fetchImpl })
    await provider.listFixtures({ season: '2024' })
    expect(url).toContain('https://example.test')
    expect(url).toContain('competitionId=99')
  })
})

it('covers null-side pens, missing matchday/round objects', () => {
  const n = normalizeUefaMatch(baseMatch({
    score: { total: { home: 0, away: 0 }, penalty: { home: null, away: 5 } },
    matchday: null,
    round: null,
    winner: null,
  }))
  expect(n.score.penalties).toEqual({ home: null, away: 5 })
  expect(n.providerStageId).toBeNull()
  expect(n.stage).toBe('GROUP')
  expect(n.winner).toBe('DRAW')
})
