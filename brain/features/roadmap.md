# Roadmap

The public `/roadmap` page: what is planned, being built, shipped, plus a
community suggestions feed users submit to and upvote. Admin-curated items and
user suggestions share one table (`roadmap_item`) and render as two views.

## Model

- A `roadmap_item` row has a `status` (`roadmap_status` enum): `PLANNED`,
  `IN_PROGRESS`, `SHIPPED` are the roadmap proper; `SUGGESTED` is the community
  bucket (user-submitted, not yet triaged onto the roadmap).
- `position` is per-status manual ordering (each column restarts at 0); the
  admin up/down reorder swaps neighbours atomically.
- `authorId` is the submitter (null for admin/system-authored items).
- `moderationStatus` (`roadmap_moderation` enum), the hybrid-moderation state:
  `PENDING` (a fresh user suggestion - public and upvotable but "under review",
  not yet official), `APPROVED` (blessed by an admin; admin-authored items
  default here), `REJECTED` (hidden from the public). Only `REJECTED` is dropped
  from the public view; `PENDING` shows flagged.
- A `roadmap_vote` row is one upvote keyed unique on `(roadmapItemId, userId)`;
  toggling removes it. Vote counts are always derived (`count(*)` grouped), never
  denormalized onto `roadmap_item`.

## Two views, one table

- **Public roadmap** (`/roadmap`, `app/pages/roadmap.vue`): the three roadmap
  status sections plus a "Community suggestions" section ranked by vote count.
  `GET /api/roadmap` returns every non-`REJECTED` item with its `voteCount`, a
  per-viewer `viewerHasVoted`, and `underReview` (true while `PENDING`); the page
  shows an "under review" tag on those. Every item carries an upvote control.
- **Admin triage** (`AdminRoadmapSection.vue` in `/admin`): `GET /api/admin/roadmap`
  (`includeHidden`) returns everything including hidden items, with author and
  vote counts, on its own `['admin-roadmap']` query key. Admins reorder, edit,
  approve a pending suggestion, set status (promoting a suggestion onto the
  roadmap auto-approves it, un-hiding even a previously-rejected one, since a
  promoted item that stayed `REJECTED` would sit on the roadmap yet vanish from
  the public list), hide/restore (`moderationStatus`), and delete.

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
separate ROADMAP backlog item; a kanban drag-drop admin UX is another.

## Sources

- `db/app-schema.ts` (`roadmap_item`, `roadmap_vote`, `roadmap_status`,
  `roadmap_moderation`)
- `server/utils/roadmap/service.ts`
- `server/api/roadmap/*` (public), `server/api/admin/roadmap/*` (admin)
- `app/composables/useRoadmap.ts`, `app/pages/roadmap.vue`,
  `app/components/AdminRoadmapSection.vue`
- `mise-tasks/roadmap-seed`, `roadmap-add`, `roadmap-pull`
