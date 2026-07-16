export interface PathBox {
  left: number
  right: number
  top: number
  bottom: number
}

export interface JourneyHop {
  d: string
  // Distance in hops from the hovered card, so a staggered animation delay draws
  // each hop after the one nearer the hover: every hop takes the same time, which
  // keeps two teams of unequal reach in step.
  delay: number
}

function centerX(b: PathBox) {
  return (b.left + b.right) / 2
}
function centerY(b: PathBox) {
  return (b.top + b.bottom) / 2
}

// The 0.75rem stub the static connector CSS puts out of each card before it turns
// vertical. The road bends at the same x so it lies over the connector rather
// than beside it.
const STUB = 12

function toPath(pts: [number, number][]): string {
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('')
}

/**
 * A team's journey as one elbow per hop, each drawn from the end nearer the
 * hovered card outward, so the road grows out of the card the pointer is on.
 *
 * Cards come ordered by round sequence (`hovered` is the hovered card's index).
 * Each hop bends at the child's stub x - the same geometry as the static
 * `::before`/`::after` connector - out of the facing edge, vertical at the stub,
 * then a lead-in onto the parent's midline. Cards are skipped rather than crossed
 * (their two team names sit on the midline). Hops before the hovered card are
 * reversed so the stroke still starts at the hovered end; `delay` grows with the
 * distance from it. Boxes are viewport rects, so direction falls out of the
 * geometry and RTL needs no special-casing.
 *
 * Coordinates are relative to `origin`, the overlay's own rect.
 */
export function bracketJourneyHops(cards: PathBox[], hovered: number, origin: { left: number; top: number }): JourneyHop[] {
  const hops: JourneyHop[] = []
  for (let i = 0; i < cards.length - 1; i++) {
    const child = cards[i]!
    const parent = cards[i + 1]!
    const toParent = centerX(parent) >= centerX(child) ? 1 : -1
    const childEdge = (toParent > 0 ? child.right : child.left) - origin.left
    const bendX = childEdge + STUB * toParent
    const parentEdge = (toParent > 0 ? parent.left : parent.right) - origin.left
    const cy = centerY(child) - origin.top
    const py = centerY(parent) - origin.top
    const pts: [number, number][] = [[childEdge, cy], [bendX, cy], [bendX, py], [parentEdge, py]]
    const past = i < hovered
    hops.push({
      d: toPath(past ? [...pts].reverse() : pts),
      delay: past ? hovered - 1 - i : i - hovered,
    })
  }
  return hops
}
