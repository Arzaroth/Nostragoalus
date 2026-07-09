# Roadmap

The public `/roadmap` page: what is planned, being built, shipped, plus a
community suggestions feed users submit to and upvote. Admin-curated items and
user suggestions share one table (`roadmap_item`) and render as two views.

## Model

- A `roadmap_item` row has a `status` (`roadmap_status` enum): `PLANNED`,
  `IN_PROGRESS`, `SHIPPED` are the roadmap proper; `SUGGESTED` is the community
  bucket (user-submitted, not yet triaged onto the roadmap).
- `position` is per-status ordering (each column restarts at 0). The admin board
  sets it by drag-drop: `reorderColumn(status, ids)` rewrites the whole target
  column's order (and each card's status, for one dragged in from another column)
  in a single transaction via `PUT /api/admin/roadmap/reorder`. It shares the
  `blessedModerationOnPromote` rule with `updateRoadmapItem`, so dragging a card
  onto the roadmap auto-approves it exactly like the status Select does. (The
  older neighbour-swap `reorderRoadmapItem` / `POST .../:id/move` was removed once
  the drag replaced it.)
- `authorId` is the submitter (null for admin/system-authored items).
- `moderationStatus` (`roadmap_moderation` enum), the hybrid-moderation state:
  `PENDING` (a fresh user suggestion - public and upvotable but "under review",
  not yet official), `APPROVED` (blessed by an admin; admin-authored items
  default here), `REJECTED` (hidden from the public). Only `REJECTED` is dropped
  from the public view; `PENDING` shows flagged.
- A `roadmap_vote` row is one upvote keyed unique on `(roadmapItemId, userId)`;
  toggling removes it. Vote counts are always derived (`count(*)` grouped), never
  denormalized onto `roadmap_item`.
- Voting closes once an item's `status` is `IN_PROGRESS` or `SHIPPED` (upvotes are
  a build-next signal, so they stop mattering there). `toggleVote` throws
  `ConflictError` (409) for those, and the board disables the upvote button with a
  "voting closed" tooltip. Still-open `PLANNED`/`SUGGESTED` items stay votable.

## Two views, one table

Both views render the same four-column kanban board, ordered as a pipeline
(`ROADMAP_COLUMNS` in `useRoadmap.ts`): Suggested -> Planned -> In progress ->
Shipped. It scrolls horizontally on narrow screens.

- **Public board** (`/roadmap`, `app/pages/roadmap.vue`): read-only. The
  community (`SUGGESTED`) column is ranked by vote count and carries the suggest
  form; the rest keep admin position order. `GET /api/roadmap` returns every
  non-`REJECTED` item with its `voteCount`, a per-viewer `viewerHasVoted`, and
  `underReview` (true while `PENDING`); pending cards show an "under review" tag.
  Every card carries an upvote control.
- **Admin board** (`AdminRoadmapSection.vue` in `/admin`): `GET /api/admin/roadmap`
  (`includeHidden`) feeds it hidden items, author and vote counts on its own
  `['admin-roadmap']` query key. Native HTML5 drag moves a card between columns
  (status change; promoting a card onto the roadmap auto-approves it, un-hiding
  even a previously-rejected one, since a promoted item that stayed `REJECTED`
  would sit on the roadmap yet vanish from the public list) or reorders it within
  one, persisted via the reorder endpoint with an optimistic cache patch. Cards
  also carry edit, approve/hide/restore (`moderationStatus`), delete, and a
  keyboard-accessible status Select (the drag path's a11y fallback).

## Public write actions

- **Suggest**: `POST /api/roadmap/suggestions` (`createSuggestion`) - signed-in
  users only. Lands in `SUGGESTED` + `PENDING` (hybrid: publicly visible and
  upvotable at once but "under review" until an admin approves it). Spam gate is
  auth plus a per-user rate limit (see
  [../architecture/server.md](../architecture/server.md) `createRateLimiter`);
  admins hide spam to `REJECTED` after the fact.
- **Vote**: `POST /api/roadmap/:id/vote` (`toggleVote`) - toggles the caller's
  upvote and returns `{ voted, voteCount }`. Rejected/missing items refuse the
  vote. Same one-per-user toggle shape as [reactions](reactions.md). The client
  refetches `['roadmap']` on success (the derived counts live only in the list
  response). UI gating (tooltip when signed out) mirrors `ReactionBar.vue`.

## CLI

- `mise run roadmap-seed` (idempotent starter set), `roadmap-add` (one item):
  bootstrap the roadmap proper.
- `mise run roadmap-pull [--all] [--limit N]`: list the `SUGGESTED` column with
  derived vote counts, author and moderation state, ranked by demand, to triage
  onto the roadmap. All three talk to Postgres via `docker compose exec psql`
  (no node_modules, prod-host safe), passing values as psql `-v` vars.

## Not localized

Roadmap item title/description are raw DB strings, English-only (the page chrome
is i18n'd across the five locales, the body is not). Localizing DB content is a
separate ROADMAP backlog item.

## Sources

- `db/app-schema.ts` (`roadmap_item`, `roadmap_vote`, `roadmap_status`,
  `roadmap_moderation`)
- `server/utils/roadmap/service.ts`
- `server/api/roadmap/*` (public), `server/api/admin/roadmap/*` (admin)
- `app/composables/useRoadmap.ts`, `app/pages/roadmap.vue`,
  `app/components/AdminRoadmapSection.vue`
- `mise-tasks/roadmap-seed`, `roadmap-add`, `roadmap-pull`
