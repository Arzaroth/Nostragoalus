# Competitions and competition routing

Nostragoalus is multi-competition by design. A tournament is a row in the
`competition` table, so supporting a new event (for example UEFA Euro) is a data
change, not a rebuild. The first and current competition is the FIFA World Cup
2026. Ranking is always per competition (there is one global ranking per
competition, plus optional [leagues](leagues.md)).

## The competition row

Each `competition` row carries:

- `slug` - the URL segment (for example `world-cup-2026`).
- `name` - the display name.
- `provider` + `externalIds` - which match-data provider to use and the ids that
  resolve fixtures, bracket and stats (see [../architecture/providers.md](../architecture/providers.md)).
- `seasonHint` - helps the provider resolve the right season.
- `isActive` - whether it shows in the switcher.

Rounds (`round`) and matches (`match`) hang off the competition. A round is
either a `GROUP_MATCHDAY` or a `KNOCKOUT` stage (`GROUP`, `R32`, `R16`, `QF`,
`SF`, `THIRD_PLACE`, `FINAL`).

## Routing: the URL is the source of truth

The active competition is a path prefix, not a stored selection:

- Competition-scoped pages live under `app/pages/[competition]/`:
  `matches` (list + detail), `bracket`, `map`, `leaderboard`, `predictions`,
  `teams/[code]`, `users/[id]`.
- Global pages stay un-prefixed: `/`, `/login`, `/signup`, `/account`,
  `/preferences`, `/admin`, `/about`, `/roadmap`, `/leagues`.

`useSelectedCompetition()` (in `app/composables/useCompetitions.ts`) reads
`route.params.competition`. Because the slug is in the URL, every link is
shareable and never shows another competition's data by accident.

The `ng-competition` cookie is a fallback only: it seeds the redirect from `/`
and from legacy un-prefixed paths. `app/middleware/competition.global.ts`
redirects a legacy path like `/matches` to `/<last>/matches`, and
`[competition]/index.vue` redirects to that competition's matches.

## The switcher

`CompetitionPill.vue` sits next to each page's H1 (chosen over a header dropdown
or sub-bar). Switching navigates to the same section under the new slug; a detail
page falls back to the section list when the target has no equivalent detail.

Every internal `NuxtLink` is prefixed with `/${slug}/`. Per-page fetches pass
`?competition=<slug>`, and personal data (My Picks, etc.) is scoped by
competition id in the service layer.

## Related

- The prediction and scoring loop that runs inside a competition:
  [predictions-and-scoring.md](predictions-and-scoring.md).
- Per-competition private groups: [leagues.md](leagues.md).
- Client routing and composable conventions:
  [../architecture/client.md](../architecture/client.md).

## Sources

- `db/app-schema.ts` (`competition`, `round`, `match` tables and enums)
- `app/composables/useCompetitions.ts`
- `app/pages/[competition]/**`
- `app/middleware/competition.global.ts`
- `app/components/CompetitionPill.vue`
- `server/api/competitions/index.get.ts`
