import type { AppStage, NormalizedMatch } from '../../../shared/types/match'
import { isIngestible } from '../sync/rounds'
import { providerForCompetition } from '../providers'
import { ProviderError } from '../errors'
import { resolveFifaSeasonId } from '../providers/fifa'
import type { MatchDataProvider } from '../providers/types'

// Why this exists: adding a competition from a provider's catalog is a leap of
// faith without it. ESPN lists 218 leagues; most of them the app cannot ingest,
// and it fails *silently* - a group fixture with no matchday is counted in
// upsertMatches()' `skipped` and simply never appears, so the admin gets a
// competition with zero matches and no error anywhere. The probe normalizes a
// real season without writing anything and reports what would actually land.

export type ProbeBlocker =
  // The provider returned nothing for this competition and season.
  | 'no_fixtures'
  // Some fixtures would be dropped at insert. Almost always a competition with
  // no group letters (a domestic league, or a single-table league phase), whose
  // matchday cannot be derived - see assignGroupMatchdays.
  | 'fixtures_dropped'
  // Two fixtures at the same knockout stage between the same pair of teams. The
  // schema cannot hold them: round is unique on (competition, stage, matchday)
  // and knockout rounds carry a null matchday, so the second leg has nowhere to
  // go, and scoring has no notion of an aggregate winner.
  | 'two_legged_knockout'
  // No season could be resolved. Reported rather than probed anyway: ESPN's
  // scoreboard without a `dates` param serves the current day only, so probing
  // season-less would summarize one day of fixtures and report a competition as
  // empty or lossy when it is the season lookup that failed.
  | 'no_season'

export interface CompetitionProbe {
  fixtures: number
  ingestible: number
  dropped: number
  groups: string[]
  stages: AppStage[]
  twoLeggedStages: AppStage[]
  hasBracket: boolean
  supported: boolean
  blockers: ProbeBlocker[]
}

// A knockout slot with no team drawn yet. ESPN names an undrawn side 'TBD'
// (toTeam's fallback), and a bracket published before its draw is all
// placeholders - so pairing on those names would read every undrawn tie at a
// stage as the same tie played twice.
function isPlaceholder(name: string | null | undefined): boolean {
  if (!name) return true
  const n = name.trim().toUpperCase()
  return n === 'TBD' || n === 'TBA' || n === '' || /^(W|RU|L)\d+$/.test(n)
}

// Same pair, same stage, twice. Ordered so a home-and-away tie is one key, and
// null when either side is undrawn, because then there is no pair to compare.
function tieKey(m: NormalizedMatch): string | null {
  if (isPlaceholder(m.homeTeam.name) || isPlaceholder(m.awayTeam.name)) return null
  const pair = [m.homeTeam.name, m.awayTeam.name].sort()
  return `${m.stage}:${pair[0]}:${pair[1]}`
}

export function summarizeFixtures(fixtures: NormalizedMatch[], hasBracket: boolean): CompetitionProbe {
  const groups = new Set<string>()
  const stages = new Set<AppStage>()
  const seenTies = new Set<string>()
  const twoLegged = new Set<AppStage>()
  let ingestible = 0

  for (const m of fixtures) {
    stages.add(m.stage)
    if (m.group) groups.add(m.group)
    if (isIngestible(m.stage, m.matchday)) ingestible += 1

    if (m.stage !== 'GROUP') {
      const key = tieKey(m)
      if (key === null) continue
      if (seenTies.has(key)) twoLegged.add(m.stage)
      else seenTies.add(key)
    }
  }

  const dropped = fixtures.length - ingestible
  const blockers: ProbeBlocker[] = []
  if (fixtures.length === 0) blockers.push('no_fixtures')
  if (dropped > 0) blockers.push('fixtures_dropped')
  if (twoLegged.size > 0) blockers.push('two_legged_knockout')

  return {
    fixtures: fixtures.length,
    ingestible,
    dropped,
    groups: [...groups].sort(),
    stages: [...stages],
    twoLeggedStages: [...twoLegged],
    hasBracket,
    supported: blockers.length === 0,
    blockers,
  }
}

export interface ProbeTarget {
  provider: string
  externalCompetitionId: string
  seasonHint: string | null
}

export interface ProbeDeps {
  makeProvider?: (target: ProbeTarget, seasonId?: string) => MatchDataProvider
  resolveSeason?: (target: ProbeTarget) => Promise<string | undefined>
}

// FIFA addresses a season by an id resolved from /seasons; every other provider
// takes the year. Unlike the sync path this cannot cache the answer on the
// competition row - the whole point is that the competition does not exist yet.
async function defaultResolveSeason(target: ProbeTarget): Promise<string | undefined> {
  if (target.provider !== 'fifa') return undefined
  return resolveFifaSeasonId({ competitionId: target.externalCompetitionId, hint: target.seasonHint })
}

// Fetch and normalize a real season, write nothing, and report what would land.
// Nothing here touches the database: a probe of a competition an admin then
// decides against must leave no trace.
export async function probeCompetition(target: ProbeTarget, deps: ProbeDeps = {}): Promise<CompetitionProbe> {
  const makeProvider =
    deps.makeProvider ??
    ((t: ProbeTarget, seasonId?: string) =>
      providerForCompetition(
        { provider: t.provider, externalCompetitionId: t.externalCompetitionId, seasonHint: t.seasonHint },
        seasonId,
      ))
  const resolveSeason = deps.resolveSeason ?? defaultResolveSeason

  const seasonId = await resolveSeason(target)
  const season = seasonId ?? target.seasonHint
  if (!season) {
    return {
      fixtures: 0,
      ingestible: 0,
      dropped: 0,
      groups: [],
      stages: [],
      twoLeggedStages: [],
      hasBracket: false,
      supported: false,
      blockers: ['no_season'],
    }
  }

  const provider = makeProvider(target, seasonId)

  // Raised here, not in each route: an unreachable keyless upstream is a 502,
  // and a caller that forgot to wrap this would leak it as a 500 instead. The
  // provider's own message is not echoed on - ProviderUpstreamError carries the
  // raw response body, which can be a Cloudflare HTML page.
  let fixtures
  try {
    fixtures = await provider.listFixtures({ season })
  } catch {
    throw new ProviderError(`could not read that competition from ${target.provider}`)
  }

  // A provider with no bracket endpoint, or one that has not published a bracket
  // yet, is information about the competition - not a reason to fail the probe.
  let hasBracket = false
  try {
    hasBracket = !!(await provider.getBracket?.())
  } catch {
    hasBracket = false
  }

  return summarizeFixtures(fixtures, hasBracket)
}
