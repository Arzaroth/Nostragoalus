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

The `fixture` provider (`server/utils/providers/fixture.ts`) returns a canned,
fully decided 8-team tree with no network. It exists so the e2e stack has a
bracket to drive; a competition reaches it only by being seeded with
`provider='fixture'`.

## Layout

`pages/[competition]/bracket.vue` is a symmetric flex tree - each side round is
split in half, the left halves fan in from the left, the right halves (reversed)
from the right, and the final sits in a center 3-row grid that keeps it on the
semis' midline whatever sits above (trophy) or below (third place).
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

Hovering a decided tie animates both its teams' roads through the tree over
~1.6s: the winner's in green (`--ng-success`), the loser's in red
(`--ng-danger`), with the two names in the hovered cell tinted to match. One
cell holds both teams (FIFA's bracket gives each its own), so a cell hover has
two journeys to tell apart rather than one to follow. Undecided ties trace
nothing - there is no outcome to colour by.

- The card carries `data-home`/`data-away`/`data-winner`/`data-seq`; the page
  finds a team's cards by attribute selector and orders them by round sequence.
  Only **official** codes are tagged, so a journey stops at the last decided
  tie rather than following a projection.
- `app/utils/bracketPath.ts` routes the polyline: out of the facing edge, across
  to the next card's near edge, then onto its midline - the same shape as the
  static elbows. It works off viewport rects, so direction falls out of the
  geometry and RTL needs no special case. Cards are skipped rather than crossed
  (their two team names sit on the midline a crossing line would cut through),
  which is why each hop is its own subpath.
- One `<svg>` overlays `.br`, `pointer-events: none`. `pathLength="1"` normalises
  every route to unit length, so a single `stroke-dashoffset` keyframe draws a
  quarter-finalist's road and a champion's at the same pace without measuring
  either. Honours `prefers-reduced-motion`.

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
