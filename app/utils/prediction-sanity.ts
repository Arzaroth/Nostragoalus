// Outlandish-score guard for the score inputs. The threshold is an absolute cap,
// not a sigma/z-score model: goal counts are low-count and Poisson-ish, so a
// variance-based bound miscalibrates. The flat ceiling stays predictable and
// the same for every fixture: 8+ goals for one side, or a 12+ goal aggregate.
export function isOutlandishScore(home: number, away: number): boolean {
  return home > 7 || away > 7 || home + away > 11
}
