# Multi-view

Watch several matches at once in a configurable grid, like a multi-stream
dashboard. Built on the existing match live data + [WebSocket
hub](../architecture/realtime.md), the [chat dock](chat.md) and the curated
[match media](../features/index.md) embeds. Back to the catalog:
[index.md](index.md).

## What the user sees

`/[competition]/multiview` (a top-level section tab, `nav.multiview`). A layout
picker (1 / 2x1 / 2x2 / 3x3) and a grid of cells. An empty cell is an "Add match"
placeholder that opens a searchable, status-filterable fixture picker; a filled
cell shows a **live tile** (score, live clock, goal-scorer chips, and the
play-by-play once the match is under way) and, when the match has curated video,
a **Tile|Stream toggle** to swap the cell to the embed. Click a cell to **focus**
it: the focused cell adds the "N watching now" count and the reaction bar, and the
[chat dock](chat.md) re-targets to that match's thread.

The chosen matches, layout and focus live in the URL
(`?cells=<id,id,...>&layout=2x2&focus=<id>`), so a multi-view is shareable and
survives a reload.

## How it works

- **State is the URL.** `app/utils/multiview.ts` is the pure, [98%-gated](../architecture/testing.md)
  model: layout capacity/dimension math (`capacityOf`, `gridDims`), query
  encode/decode (`parseMultiviewQuery`/`buildMultiviewQuery`, `decodeCells`),
  `visibleCells`/`resolveFocus`, cell `add`/`replace`/`remove`, and the
  stream-cap check `canEnableStream`. The page
  (`app/pages/[competition]/multiview.vue`) derives state from `route.query` and
  writes every change back with `router.replace`. Cells beyond the layout's
  capacity stay in the URL (shrinking then re-growing the layout re-reveals them).
- **One socket for the whole grid.** `MultiviewGrid.vue` calls
  [`useLiveMatches`](../architecture/realtime.md) once for the cell matches, so
  scores/clock ride a single `/_ws` subscription and patch the `['matches', slug]`
  cache the tiles read. On `scores:changed` it invalidates the per-cell
  `useMatchLiveDetail` and `useMatchTimeline` queries (vue-query, no sockets of
  their own, deduped by match id).
- **Per-cell vs focused-cell.** The play-by-play (`useMatchTimeline`) and live
  detail are fetched for every started cell, so each tile shows its own timeline -
  they are plain vue-query fetches, cheap enough to run per cell. Only the
  socket-backed pieces stay focused-cell only: `useMatchPresence` (opens a socket
  and sends the `viewing` ping, wrapped in `MultiviewCellViewers` so its socket
  exists only while mounted) and `useMatchReactions` (socket). This keeps a 4-cell
  grid at one scores socket + at most one reactions + one presence, instead of a
  per-cell socket blow-up.
- **Cells are bounded to the grid.** `MultiviewGrid` sets a definite `height`
  (`calc(100dvh - var(--ng-header-h,4rem) - var(--ng-footer-h,2.25rem) - 9rem)`, the
  var fallbacks keep the calc valid before the header/footer `ResizeObserver`s set
  them) and each cell carries `min-h-0`, so a cell's play-by-play scrolls inside it
  (`max-h-full`) instead of stretching the cell and pushing the page.
- **Streams.** `MultiviewCellStream` reuses `MatchMediaEmbed` with the first
  embeddable item from `visibleMediaForStatus(useMatchMedia(id), status)`. The
  Stream toggle is disabled when a match has no embeddable media or when the
  one-stream-at-a-time cap (`MAX_STREAM_CELLS`) is reached; a cell auto-reverts to
  the tile if its embed disappears.
- **Chat follows focus, not the route.** `useMultiviewFocus` is an app-level
  singleton (same one-slot pattern as `useChatDockOpen`) holding
  `focusedMatchId` + `presentCells` + a page-registered focus-request handler. The
  page publishes the focus/cells (and clears them on unmount); the single
  [`ChatDock`](chat.md) derives its match thread from `focusedMatchId` (falling back
  to the route). An inbox/deep-link click on a match that is a grid cell calls
  `tryFocus`, which routes through the page handler to write `focus` to the URL (the
  single source of truth), so the grid highlight and the dock thread move together
  instead of the dock drifting from the grid. See [decisions.md](../decisions.md).

## Why not per-cell chat

Chat is per-league end-to-end encrypted and each `useLeagueChat` opens its own
socket and decrypts independently, so N per-cell chats would multiply sockets and
redundant decryption and the singleton route-driven dock can't show several
threads. Instead there is one dock that follows the focused cell. See
[chat.md](chat.md) and [decisions.md](../decisions.md).

## Reused, not reinvented

- `app/components/match/PlayByPlay.vue` (`MatchPlayByPlay`) + the pure match-view
  helpers in `app/utils/match-view.ts` (`pbpTextSpec`/`isGoalKind`/`pbpFlagCode`,
  and the shared `liveClockSpec` live-clock rule), both extracted from the match
  detail page and shared with the tile.
- `useLiveMatches`, `useMatchMedia` + `MatchMediaEmbed`, `ReactionBar`,
  `MatchViewers`, the fixture list query `useMatches`.

## Sources

- `app/utils/multiview.ts` (+ `multiview.test.ts`)
- `app/pages/[competition]/multiview.vue`
- `app/components/multiview/*` (`Grid`, `Cell`, `CellTile`, `CellStream`,
  `CellViewers`, `SlotEmpty`, `PickerDialog`)
- `app/composables/useMultiviewFocus.ts`, `useMatchLiveDetail.ts`,
  `useMatchTimeline.ts`
- `app/components/ChatDock.vue` (focus-driven match thread + inbox `tryFocus`)
- `app/components/match/PlayByPlay.vue`, `app/utils/match-view.ts`
- `app/layouts/default.vue` (nav entry, full-width branch), `CompetitionPill.vue`
  (section allow-list)
