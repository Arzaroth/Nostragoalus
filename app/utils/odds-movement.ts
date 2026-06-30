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

// The decimals the odds UI prints; movement is judged at this precision (and the
// component formats with the same constant) so the arrow can never contradict
// the number it sits next to.
export const ODDS_DECIMALS = 2
const roundToDisplay = (v: number) => {
  const f = 10 ** ODDS_DECIMALS
  return Math.round(v * f) / f
}

// Compare the prices as they are shown (each rounded to the displayed precision),
// then re-round the difference to shed float noise. Two prices that print the
// same read flat; a marker only appears when the printed numbers actually differ.
function outcomeMovement(initial: number, current: number): OutcomeMovement {
  const delta = roundToDisplay(roundToDisplay(current) - roundToDisplay(initial))
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
