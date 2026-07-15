import type { AppStage } from '../../../shared/types/match'

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

// The trailing group letter ("Group F" -> "F"), shared by both providers.
export function parseGroupLetter(name: string | null | undefined): string | null {
  return name?.match(/([A-L])\s*$/i)?.[1]?.toUpperCase() ?? null
}
