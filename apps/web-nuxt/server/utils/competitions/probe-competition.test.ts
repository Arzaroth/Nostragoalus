import { describe, it, expect, vi } from 'vitest'
import { probeCompetition } from './probe'
import { ProviderError } from '../errors'
import type { AppStage, NormalizedMatch } from '../../../shared/types/match'
import type { MatchDataProvider } from '../providers/types'

let seq = 0

function fixture(stage: AppStage, matchday: number | null = null, group: string | null = null): NormalizedMatch {
  // Distinct teams per fixture: the two-legged check keys off the pair, so a
  // shared Home/Away would read two unrelated ties as one played twice.
  const n = ++seq
  return {
    providerMatchId: `m-${stage}-${matchday ?? 'x'}-${n}`,
    stage,
    group,
    matchday,
    homeTeam: { id: `h${n}`, name: `Home ${n}`, code: 'HOM' },
    awayTeam: { id: `a${n}`, name: `Away ${n}`, code: 'AWY' },
    kickoffTime: '2026-06-11T16:00:00Z',
    status: 'SCHEDULED',
    score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null }, penalties: null },
    winner: null,
  } as NormalizedMatch
}

function adapter(over: Partial<MatchDataProvider> = {}): MatchDataProvider {
  return {
    meta: { name: 'stub', rateLimitPerMin: 0, dailyCap: null },
    listFixtures: async () => [fixture('GROUP', 1, 'A'), fixture('FINAL')],
    getMatchesByDate: async () => [],
    getLiveMatches: async () => [],
    ...over,
  } as MatchDataProvider
}

const target = { provider: 'espn', externalCompetitionId: 'uefa.euro', seasonHint: '2028' }

describe('probeCompetition', () => {
  it('summarizes what the provider returns for the requested season', async () => {
    const listFixtures = vi.fn(async () => [fixture('GROUP', 1, 'A'), fixture('FINAL')])
    const probe = await probeCompetition(target, {
      makeProvider: () => adapter({ listFixtures }),
      resolveSeason: async () => undefined,
    })
    expect(probe).toMatchObject({ fixtures: 2, ingestible: 2, supported: true })
    expect(listFixtures).toHaveBeenCalledWith({ season: '2028' })
  })

  // FIFA addresses a season by a resolved id rather than the year, and the probe
  // cannot cache it on a competition row that does not exist yet.
  it('passes a resolved season id through to the provider when there is one', async () => {
    const listFixtures = vi.fn(async () => [fixture('FINAL')])
    await probeCompetition(
      { provider: 'fifa', externalCompetitionId: '17', seasonHint: '2026' },
      { makeProvider: () => adapter({ listFixtures }), resolveSeason: async () => '255711' },
    )
    expect(listFixtures).toHaveBeenCalledWith({ season: '255711' })
  })

  // Probing season-less would ask ESPN's scoreboard with no `dates` param, which
  // serves the current day only - so the admin would be told the competition is
  // empty when it is the season lookup that failed.
  it('reports no_season instead of probing with an empty season', async () => {
    const listFixtures = vi.fn(async () => [fixture('FINAL')])
    const probe = await probeCompetition(
      { provider: 'espn', externalCompetitionId: 'x', seasonHint: null },
      { makeProvider: () => adapter({ listFixtures }), resolveSeason: async () => undefined },
    )
    expect(probe).toMatchObject({ fixtures: 0, supported: false, blockers: ['no_season'] })
    expect(listFixtures).not.toHaveBeenCalled()
  })

  // An unreachable provider is not an unsupported competition, and the upstream's
  // own body must not reach the client.
  it('raises a ProviderError when the provider cannot be read', async () => {
    await expect(
      probeCompetition(target, {
        makeProvider: () =>
          adapter({
            listFixtures: async () => {
              throw new Error('<html>Access Denied</html>')
            },
          }),
        resolveSeason: async () => undefined,
      }),
    ).rejects.toThrow(ProviderError)
  })

  // Only FIFA needs a season resolved to an id; everyone else takes the year, so
  // the default resolver must not reach for the network on their behalf.
  it('resolves no season id by default for a provider that does not use one', async () => {
    const listFixtures = vi.fn(async () => [fixture('FINAL')])
    await probeCompetition({ provider: 'espn', externalCompetitionId: 'x', seasonHint: '2026' }, {
      makeProvider: () => adapter({ listFixtures }),
    })
    expect(listFixtures).toHaveBeenCalledWith({ season: '2026' })
  })

  it('reports a bracket when the provider publishes one', async () => {
    const probe = await probeCompetition(target, {
      makeProvider: () => adapter({ getBracket: async () => ({ rounds: [] }) as never }),
      resolveSeason: async () => undefined,
    })
    expect(probe.hasBracket).toBe(true)
  })

  // A provider with no bracket endpoint, or one that has not published a bracket
  // yet, is information about the competition - not a reason to fail the probe.
  it('treats a missing or failing bracket as absent rather than fatal', async () => {
    const noMethod = await probeCompetition(target, {
      makeProvider: () => adapter(),
      resolveSeason: async () => undefined,
    })
    expect(noMethod.hasBracket).toBe(false)
    expect(noMethod.supported).toBe(true)

    const throwing = await probeCompetition(target, {
      makeProvider: () =>
        adapter({
          getBracket: async () => {
            throw new Error('404')
          },
        }),
      resolveSeason: async () => undefined,
    })
    expect(throwing.hasBracket).toBe(false)
    expect(throwing.supported).toBe(true)
  })

  it('surfaces an unsupported competition rather than throwing', async () => {
    const probe = await probeCompetition(target, {
      // A domestic league: GROUP stage, no letter, so no matchday can be derived.
      makeProvider: () => adapter({ listFixtures: async () => [fixture('GROUP'), fixture('GROUP')] }),
      resolveSeason: async () => undefined,
    })
    expect(probe.supported).toBe(false)
    expect(probe.blockers).toContain('fixtures_dropped')
  })
})
