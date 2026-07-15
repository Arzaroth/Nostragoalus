export interface PathBox {
  left: number
  right: number
  top: number
  bottom: number
}

function centerX(b: PathBox) {
  return (b.left + b.right) / 2
}
function centerY(b: PathBox) {
  return (b.top + b.bottom) / 2
}

/**
 * SVG path tracing a team's journey through the cards it appears in, in order.
 *
 * One subpath per hop, each an orthogonal elbow matching the static connector
 * geometry: out of the facing edge, across to the next card's near edge, then
 * vertical onto its midline. Cards are skipped rather than crossed (their two
 * team names sit on the midline). Boxes are viewport rects, so direction falls
 * out of the geometry and RTL needs no special-casing.
 *
 * Coordinates are relative to `origin`, the overlay's own rect.
 */
export function bracketJourneyPath(cards: PathBox[], origin: { left: number; top: number }): string {
  const d: string[] = []
  for (let i = 0; i < cards.length - 1; i++) {
    const a = cards[i]!
    const b = cards[i + 1]!
    const forward = centerX(b) >= centerX(a)
    const exit = (forward ? a.right : a.left) - origin.left
    const enter = (forward ? b.left : b.right) - origin.left
    const ay = centerY(a) - origin.top
    const by = centerY(b) - origin.top
    d.push(`M${exit.toFixed(1)},${ay.toFixed(1)}L${enter.toFixed(1)},${ay.toFixed(1)}L${enter.toFixed(1)},${by.toFixed(1)}`)
  }
  return d.join('')
}
