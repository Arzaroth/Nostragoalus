# Knockout bracket

`/[competition]/bracket` renders the knockout tree: every tie, its score, and
who advanced. Read-only - it is a view of provider data, not something the app
computes or stores.

Related: [competitions.md](competitions.md) ·
[../architecture/providers.md](../architecture/providers.md) ·
[../architecture/rtl.md](../architecture/rtl.md) (the mirrored tree).

## Where the data comes from

`server/api/competitions/bracket.get.ts` builds it from **the provider**
(`provider.getBracket()`), not the DB - the `match` table is only consulted to
map each `providerMatchId` to an internal match id so a card can link to its
match page. A card whose tie has no internal match renders as a plain `div`.

The pipeline, per request (memoised by `server/utils/bracket/cache.ts`):

1. `provider.getBracket()` - the raw tree (`NormalizedBracket` in
   `shared/types/match.ts`: `rounds[]`, each with `name`, `sequence`, `matches[]`).
2. `orderBracketFeeders` - sorts each round's matches under the parent tie they
   feed, resolving `W{n}` feeder refs by `matchNumber`. The third-place tie is
   excluded from the feeding chain.
3. `projectBracket` - fills undecided sides with the team currently projected to
   qualify from live group standings. Projected sides are display-only and are
   marked as such (dashed underline + a "projected" chip).

Failures fall back to "no bracket" rather than erroring the page.

The `fixture` provider (`server/utils/providers/fixture.ts`) returns a canned
8-team tree with no network, so the e2e stack has a bracket to drive. It models a
late-tournament state - everything played except a final that is scheduled with
both sides official - which is what gives the specs a genuinely undecided card,
and it names the third-place tie "Bronze final" like the live feed does. A
competition reaches it only by being seeded with `provider='fixture'`; no route
writes that column, but that is an absence rather than a guard.

## Layout

`pages/[competition]/bracket.vue` is a symmetric flex tree - each side round is
split in half, the left halves fan in from the left, the right halves (reversed)
from the right, and the center is a 3-row grid whose empty middle row pins the
semis' midline. The trophy and the final sit in the top row (bottom-aligned, so
the final rides just **above** the midline) and the third-place tie in the bottom
row (top-aligned, just **below** it). That vertical split is deliberate: it keeps
the winner roads (which rise into the final) and the loser roads (which fall into
the bronze) in separate horizontal lanes instead of overlapping on the midline.
`app/utils/bracket-sides.ts` does the splitting, pulling the final and the
third-place tie out of the round list by `roundLabelKey(r.name)` - a name ladder,
because `BracketRound` carries only the provider's display name (the feed calls
the third-place tie "Bronze final"), not the frozen `stage` enum. Each side
column keeps its whole round, `sequence` included - the journey lines order a
team's cards by it.

Connectors between cards are **scoped-CSS `::before`/`::after` borders** on
`.br-cell`, not SVG: a stub out of the card, a vertical merging at mid-gap, a
lead-in to the next tie. Geometry is logical CSS, so it mirrors under RTL.

`BracketMatchCard.vue` is one card: both teams on a single row (home left, away
right), the winner in bold, live ties with a pulsing dot.

## Journey lines (hover)

Hovering a cell with two known teams traces both their roads through the tree,
each **growing out of the hovered card** rather than drawn as one static line. A
**decided** tie colours the winner green (`--ng-success`) and loser red
(`--ng-danger`); an **undecided** tie whose two sides are both official (a
scheduled final, say) has no outcome to read, so it colours home (accent,
`--p-primary-color`) and away (amber, `--ng-star`) instead. Either way the two
names in the hovered cell are tinted to match. One cell holds both teams (FIFA's
bracket gives each its own), so a cell hover has two journeys to tell apart. A
tie still missing a side traces nothing.

- The card carries `data-home`/`data-away`/`data-winner`/`data-seq`; the page
  finds a team's cards by attribute selector and orders them by round sequence.
  Only **official** codes are tagged, so a journey stops at the last decided
  tie rather than following a projection.
- `app/utils/bracketPath.ts` (`bracketJourneyHops`) routes **one elbow per hop**,
  each bending at the child's stub x (12px / 0.75rem out of the facing edge) - the
  same coordinates as the static `::before`/`::after` connector, so the road lies
  **over** the grey elbow instead of beside it. It works off viewport rects, so
  direction falls out of the geometry and RTL needs no special case. Cards are
  skipped rather than crossed (their two team names sit on the midline a crossing
  line would cut through), which is why each hop is its own path.
- The animation emanates from the hovered card: each hop draws over a fixed
  ~0.4s, and a per-hop `--hop` delay (its distance from the hovered card in hops)
  staggers them outward - so a hop past the hover reverses its point order to
  start at the hovered end, and hops before/after the hover fan out in both
  directions at once. Because every hop takes the same time, two teams of unequal
  reach stay in step (the sync a single whole-path keyframe could not give).
- One `<svg>` overlays `.br`, `pointer-events: none`. `pathLength="1"` normalises
  each hop to unit length so one `stroke-dashoffset` keyframe draws it in a fixed
  time without measuring. Spell it `pathLength`: SVG attribute names are
  case-sensitive, and `path-length` is silently ignored, which leaves the dash
  pattern measured in pixels and the route appearing fully drawn. `animation-fill:
  both` holds the undrawn first frame through the delay so a later hop stays
  hidden until its turn. Honours `prefers-reduced-motion`.
- Each hover bumps a counter that keys the paths, so Vue remounts them and the
  animation restarts. Reusing a team+kind+hop key across two cards (a semi-final
  and the final the same side won) would patch the element instead and leave its
  finished animation in place. Re-entering the same card is a no-op, since
  `mouseover` fires again for every child crossed.
- A live score can re-render the tree under a stationary pointer, with no event
  to recompute against, so the trace is dropped when the bracket data changes
  rather than left pointing at stale coordinates.
- A team eliminated in its first bracket appearance has one card and so no hop:
  it gets the red name tint but no line. See [../../TODO.md](../../TODO.md).

## Files

| Path | Role |
|---|---|
| `app/pages/[competition]/bracket.vue` | Tree layout, connector CSS, hover tracing + SVG overlay |
| `app/components/BracketMatchCard.vue` | One tie; winner/projected/live styling, hover glow |
| `app/utils/bracket-sides.ts` | Split rounds into left / right / final / third |
| `app/utils/bracketPath.ts` | Journey polyline routing |
| `server/api/competitions/bracket.get.ts` | Build + project the tree |
| `server/utils/providers/fixture.ts` | Canned offline tree for e2e |
| `server/utils/bracket/{projection,cache}.ts` | Projected qualifiers, per-request memo |
| `server/utils/providers/bracket-order.ts` | Feeder ordering |
| `tests/e2e/bracket-journey.e2e.ts` | Hover tracing over the real UI |
