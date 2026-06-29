import type { OddsTriple } from '#shared/types/odds'

// 'in' = the price shortened (current < opening): the outcome firmed up. 'out' =
// it drifted (current > opening): less likely. 'flat' = no meaningful change.
export type OddsDirection = 'in' | 'out' | 'flat'

export interface OutcomeMovement {
  direction: OddsDirection
  // Signed drift current - opening, rounded to the 2 decimals the UI shows.
  delta: number
}

export interface OddsMovement {
  home: OutcomeMovement
  draw: OutcomeMovement
  away: OutcomeMovement
  // false when the snapshot has no opening price to compare against.
  hasInitial: boolean
}

const FLAT: OutcomeMovement = { direction: 'flat', delta: 0 }

// Round to the displayed precision so the arrow can never contradict the number:
// a sub-0.005 wobble reads as flat, exactly as the two-decimal price does.
function outcomeMovement(initial: number, current: number): OutcomeMovement {
  const delta = Math.round((current - initial) * 100) / 100
  if (delta < 0) return { direction: 'in', delta }
  if (delta > 0) return { direction: 'out', delta }
  return { ...FLAT }
}

export function oddsMovement(initial: OddsTriple | null | undefined, current: OddsTriple): OddsMovement {
  if (!initial) return { home: { ...FLAT }, draw: { ...FLAT }, away: { ...FLAT }, hasInitial: false }
  return {
    home: outcomeMovement(initial.home, current.home),
    draw: outcomeMovement(initial.draw, current.draw),
    away: outcomeMovement(initial.away, current.away),
    hasInitial: true,
  }
}
