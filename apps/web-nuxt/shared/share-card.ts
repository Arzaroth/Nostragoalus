// Pure, render-agnostic share-card helpers used by BOTH the client card
// component (ShareCardView.vue) and the server-side OG image template, so the
// round mapping, tier palette, score format and flag URL can't drift between the
// two renderers (they live in different trees and can't share app/utils).

// Maps a provider bracket label to its bracket.round.* i18n key, or null when it
// isn't a known knockout round (the caller shows the group letter or raw label
// instead). Order matters, and for the same reasons as the server-side ladder in
// server/utils/providers/stage.ts: "final tournament" (UEFA's group stage),
// "semi-finals" and "bronze final" all contain "final". Keep the two in step.
export function roundLabelKey(name: string | null | undefined): string | null {
  const n = (name ?? '').toLowerCase()
  if (/final tournament/.test(n)) return null
  if (/round of 32|last 32/.test(n)) return 'bracket.round.r32'
  if (/round of 16|last 16/.test(n)) return 'bracket.round.r16'
  if (/quarter/.test(n)) return 'bracket.round.qf'
  if (/semi/.test(n)) return 'bracket.round.sf'
  if (/third|3rd|bronze/.test(n)) return 'bracket.round.third'
  if (/final/.test(n)) return 'bracket.round.final'
  return null
}

// Scoring-tier chip colors, one source for both card renderers.
export const TIER_COLOR: Record<string, string> = { EXACT: '#22c55e', DIFF: '#3b82f6', OUTCOME: '#eab308', MISS: '#64748b' }

// A scoreline with nulls shown as 0 ("3 - 1"); used for predicted and actual scores.
export function shareScore(a: number | null | undefined, b: number | null | undefined): string {
  return `${a ?? 0} - ${b ?? 0}`
}

// FIFA flag image from a team tricode (e.g. MEX); null when no code. Here (not
// app/utils) so the server OG renderer and the client build the identical URL.
export function flagUrl(code: string | null | undefined): string | null {
  return code ? `https://api.fifa.com/api/v3/picture/flags-sq-3/${code}` : null
}
