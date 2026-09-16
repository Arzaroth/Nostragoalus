import type { Sport } from '#shared/sport'

// Outlandish-score guard for the score inputs. The threshold is an absolute cap,
// not a sigma/z-score model: scores are low-count and Poisson-ish, so a
// variance-based bound miscalibrates. A flat ceiling stays predictable and the
// same for every fixture.
//
// It has to be per sport, because a converted try is worth seven on its own: the
// football ceiling called every realistic rugby scoreline outlandish, so a pick
// of 21-17 - an ordinary Six Nations result - could not be saved without
// confirming a warning. The rugby pair clears the real record books (Ireland beat
// Romania 82-8 at RWC 2023) while still catching the typo the guard is for, which
// is a digit too many.
// Keyed by the Sport union, so a sport added to shared/sport.ts does not compile
// until it has a ceiling. Inheriting football's silently is how every realistic
// rugby scoreline came to need confirming.
const CAPS: Record<Sport, { side: number; total: number }> = {
  FOOTBALL: { side: 7, total: 11 },
  RUGBY_UNION: { side: 100, total: 140 },
}

// The sport arrives from the competition meta, which is not narrowed to Sport
// on the client yet, so an unknown value is taken as football rather than
// trusted: a ceiling that never fires is not a guard.
export function isOutlandishScore(home: number, away: number, sport?: string | null): boolean {
  const cap = CAPS[sport as Sport] ?? CAPS.FOOTBALL
  return home > cap.side || away > cap.side || home + away > cap.total
}
