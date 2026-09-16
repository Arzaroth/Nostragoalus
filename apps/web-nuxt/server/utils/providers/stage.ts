import type { AppStage, NormalizedMatch } from '../../../shared/types/match'

// One ordered keyword ladder for both providers. Order matters: "final
// tournament" (UEFA's group stage) and the third-place variants ("bronze final")
// must be tested before the bare "final". Previously fifa.ts and uefa.ts kept
// separate, differently ordered ladders - a latent divergence.
const STAGE_KEYWORDS: { match: (s: string) => boolean; stage: AppStage }[] = [
  { match: (s) => s.includes('final tournament'), stage: 'GROUP' },
  { match: (s) => /third|3rd|bronze/.test(s), stage: 'THIRD_PLACE' },
  { match: (s) => s.includes('semi'), stage: 'SF' },
  { match: (s) => s.includes('quarter'), stage: 'QF' },
  { match: (s) => s.includes('round of 32'), stage: 'R32' },
  { match: (s) => s.includes('round of 16'), stage: 'R16' },
  { match: (s) => s.includes('final'), stage: 'FINAL' },
]

export function mapStageFromName(name: string | null | undefined): AppStage {
  const s = (name ?? '').toLowerCase()
  return STAGE_KEYWORDS.find((k) => k.match(s))?.stage ?? 'GROUP'
}

// Two group-name parsers, deliberately. Use the LOOSE one on a name you already
// know is a group label (FIFA/UEFA hand us a localized "Groupe A", so anchoring
// the whole string would drop every non-English feed). Use the STRICT one on a
// name that might be anything else - ESPN's standings children are named after
// the competition for a domestic league, and "Premier League" ends in a letter
// the loose parser happily reads as group E.
export function parseGroupLetter(name: string | null | undefined): string | null {
  return name?.match(/([A-L])\s*$/i)?.[1]?.toUpperCase() ?? null
}

export function parseGroupNameStrict(name: string | null | undefined): string | null {
  return name?.match(/^group\s+([a-l])$/i)?.[1]?.toUpperCase() ?? null
}

// No feed we read publishes a matchday, so it is derived. A round is the unit
// predictions are locked and scored against, and a fixture that ends up without
// one never reaches the match table at all (see isIngestible), so every GROUP
// fixture has to come out of here with a number.
//
// Two shapes, decided by whether the competition has pool letters at all:
export function assignMatchdays(matches: NormalizedMatch[]): NormalizedMatch[] {
  const pooled = matches.some((m) => m.stage === 'GROUP' && m.group)
  return pooled ? assignPoolMatchdays(matches) : assignSingleTableMatchdays(matches)
}

// Pools: order each pool's fixtures by kickoff and pair them off. Every pool the
// feeds carry is four teams, so a matchday is two matches.
function assignPoolMatchdays(matches: NormalizedMatch[]): NormalizedMatch[] {
  const byGroup = new Map<string, NormalizedMatch[]>()
  for (const m of matches) {
    if (m.stage !== 'GROUP' || !m.group) continue
    const bucket = byGroup.get(m.group) ?? []
    bucket.push(m)
    byGroup.set(m.group, bucket)
  }

  for (const groupMatches of byGroup.values()) {
    groupMatches.sort((a, b) => a.kickoffTime.localeCompare(b.kickoffTime))
    groupMatches.forEach((m, index) => {
      m.matchday = Math.floor(index / 2) + 1
    })
  }
  return matches
}

// One table, no letters: the Six Nations arrives as "Pool" with an empty
// subType, and a domestic league has nothing at all. Pairing off by twos is
// wrong here because a round is however many matches it takes for every team to
// play once - three in the Six Nations, ten in a twenty-team league.
//
// So that is the rule applied literally: walk the fixtures in kickoff order and
// start a new round when a team would appear in the current one twice. It needs
// no per-competition size and no date threshold, which a midweek round would
// break. A fixture moved out of its round lands in a later one, which is the
// same answer any date rule gives and the feed carries nothing to do better.
function assignSingleTableMatchdays(matches: NormalizedMatch[]): NormalizedMatch[] {
  const table = matches.filter((m) => m.stage === 'GROUP')
  table.sort((a, b) => a.kickoffTime.localeCompare(b.kickoffTime))

  let matchday = 1
  let playing = new Set<string>()
  for (const m of table) {
    // Names, not codes: a code is nullable on every feed, and two nulls would
    // read as the same team and split every round in half.
    const sides = [m.homeTeam.name, m.awayTeam.name]
    if (sides.some((side) => playing.has(side))) {
      matchday += 1
      playing = new Set()
    }
    sides.forEach((side) => playing.add(side))
    m.matchday = matchday
  }
  return matches
}
