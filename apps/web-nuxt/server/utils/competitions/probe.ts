import type { AppStage, NormalizedMatch } from '../../../shared/types/match'
import { isIngestible } from '../sync/rounds'

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

// Same pair, same stage, twice. Ordered so a home-and-away tie is one key.
function tieKey(m: NormalizedMatch): string {
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
