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

// No feed we read publishes a group matchday, so derive it: order each group's
// fixtures by kickoff and pair them off. Matches without a group letter are left
// alone - a league has no matchday we can infer this way.
export function assignGroupMatchdays(matches: NormalizedMatch[]): NormalizedMatch[] {
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
