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
const CAPS: Record<string, { side: number; total: number }> = {
  FOOTBALL: { side: 7, total: 11 },
  RUGBY_UNION: { side: 100, total: 140 },
}

export function isOutlandishScore(home: number, away: number, sport?: string | null): boolean {
  const cap = CAPS[sport ?? 'FOOTBALL'] ?? CAPS.FOOTBALL!
  return home > cap.side || away > cap.side || home + away > cap.total
}
