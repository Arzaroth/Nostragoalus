// Shared geometry for the small inline SVG sparklines (the analytics accuracy
// line and the head-to-head lead chart). Both draw into a stretched viewBox and
// fill the width, keeping a crisp stroke via vector-effect="non-scaling-stroke";
// full-width transparent hover bands carry the per-point tooltips.

export const SPARK_W = 300
export const SPARK_H = 100

export interface SparkBand<T> {
  item: T
  x: number
  band: number
}

// Even-spaced x positions and one full-width hover band per point. A single
// point sits at x=0 (the callers hide the chart until there is more than one).
export function sparkBands<T>(items: T[]): SparkBand<T>[] {
  const n = items.length
  const band = SPARK_W / n
  return items.map((item, i) => ({ item, x: n <= 1 ? 0 : (i / (n - 1)) * SPARK_W, band }))
}

function yOf<T>(b: SparkBand<T>, value: (item: T) => number, max: number): number {
  return SPARK_H - (value(b.item) / Math.max(1, max)) * SPARK_H
}

// Polyline "x,y x,y ..." for one series, its values scaled against max (0 at the
// baseline). max is floored at 1 so an all-zero series never divides by zero.
export function sparkLine<T>(bands: SparkBand<T>[], value: (item: T) => number, max: number): string {
  return bands.map((b) => `${b.x},${yOf(b, value, max)}`).join(' ')
}

// The same line closed down to the baseline, for a filled single-series area.
export function sparkArea<T>(bands: SparkBand<T>[], value: (item: T) => number, max: number): string {
  const pts = bands.map((b) => `L${b.x},${yOf(b, value, max)}`).join(' ')
  return `M0,${SPARK_H} ${pts} L${SPARK_W},${SPARK_H} Z`
}
