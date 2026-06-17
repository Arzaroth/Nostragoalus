// Fixed match-reaction palette. The KEY is what gets stored (DB enum + API +
// WS payloads); the glyph is rendered client-side, so the palette can grow or
// be re-skinned without a data migration. Order here is the display order.
export const REACTION_EMOJIS = ['FIRE', 'GOAL', 'WOW', 'LAUGH', 'SAD', 'ANGRY'] as const

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number]

export const REACTION_GLYPHS: Record<ReactionEmoji, string> = {
  FIRE: '🔥',
  GOAL: '⚽',
  WOW: '😮',
  LAUGH: '🤣',
  SAD: '😢',
  ANGRY: '😡',
}

// Counts keyed by reaction. Always a full record (zeros included) so the client
// and live patches can merge maps without missing-key checks.
export type ReactionTotals = Record<ReactionEmoji, number>

export function emptyReactionTotals(): ReactionTotals {
  return { FIRE: 0, GOAL: 0, WOW: 0, LAUGH: 0, SAD: 0, ANGRY: 0 }
}

export function isReactionEmoji(value: unknown): value is ReactionEmoji {
  return typeof value === 'string' && (REACTION_EMOJIS as readonly string[]).includes(value)
}
