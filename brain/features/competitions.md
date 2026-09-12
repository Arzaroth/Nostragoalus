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
- `provider` + `externalCompetitionId`/`externalSeasonId` - which match-data
  provider to use and the ids that resolve fixtures, bracket and stats
  (see [../architecture/providers.md](../architecture/providers.md)).
- `seasonHint` - helps the provider resolve the right season.
- `isActive` - whether it shows in the switcher.

Rounds (`round`) and matches (`match`) hang off the competition. A round is
either a `GROUP_MATCHDAY` or a `KNOCKOUT` stage (`GROUP`, `R32`, `R16`, `QF`,
`SF`, `THIRD_PLACE`, `FINAL`).

## Routing: the URL is the source of truth

The active competition is a path prefix, not a stored selection:

- Competition-scoped pages live under `apps/web-nuxt/app/pages/[competition]/`:
  `matches` (list + detail), `bracket`, `map`, `leaderboard`, `bot`,
  `multiview`, `wrapped`, `teams/[code]`, `users/[id]`.
- Global pages stay un-prefixed: `/`, `/login`, `/signup`, `/account`,
  `/preferences`, `/admin`, `/about`, `/roadmap`, `/leagues`.

`useSelectedCompetition()` (in `apps/web-nuxt/app/composables/useCompetitions.ts`) reads
`route.params.competition`. Because the slug is in the URL, every link is
shareable and never shows another competition's data by accident.

The `ng-competition` cookie is a fallback only: it seeds the redirect from `/`
and from legacy un-prefixed paths. `apps/web-nuxt/app/middleware/competition.global.ts`
redirects a legacy path like `/matches` to `/<last>/matches`, and
`[competition]/index.vue` redirects to that competition's matches.

## The default competition

Where a slug-less context lands (a first visit with no cookie, the `/` redirect,
the deep link of a notification that spans competitions) is **admin-set**, not
compiled in: it is the `default_competition` key in `app_setting`, written from
the admin Competitions section and read by `getDefaultCompetitionSlug()` in
`apps/web-nuxt/server/utils/competitions/store.ts`.

The stored slug is resolved, never trusted: it wins only while it names an
*active* competition, because archiving or deleting that competition would
otherwise 404 every slug-less landing. Failing that it takes the newest active
season, and only with no competition at all does it fall back to
`FALLBACK_COMPETITION` in `apps/web-nuxt/shared/competition.ts`. Writes are
validated the same way, so an unknown or archived slug is a 404 rather than a
setting that silently does nothing.

The client learns it from `/api/competitions`, which returns `defaultSlug`
alongside the list. `apps/web-nuxt/app/plugins/competition-meta.server.ts`
resolves both during SSR into a `useState` the payload carries, so the first
render already knows them; the route middleware validates slugs against the same
state instead of fetching the list again. Pure helpers that need it
(`cabinetPath`, `notificationPushContent`) take it as an argument rather than
importing a constant, since the value is not knowable at build time.

## Adding a competition (admin)

Which competitions exist is admin-managed, not a code constant. Two pieces:

- **Discovery** - `discoverCompetitions()` is an optional method on
  `MatchDataProvider` (`server/utils/providers/types.ts`), implemented for ESPN
  against the core API's league catalog. The index carries `$ref` links only, so
  each league's name, season and `isTournament` flag costs one hop; they go
  through the tight ref limiter rather than the scoreboard's one-per-second. ~218
  leagues, ~2s. Not every provider can enumerate (UEFA's ids are a curated
  handful, the offline `fixture` provider has one), and that is a normal answer.
- **The probe** - `summarizeFixtures()` in
  `server/utils/competitions/probe.ts`. `isTournament` cannot gate anything (ESPN
  marks the Champions League a tournament though its league phase is a single
  table), so the gate is a dry run over real fixtures instead: normalize a season,
  write nothing, and report what would land.

The probe blocks on four things:

- `no_fixtures` - the provider returned nothing.
- `fixtures_dropped` - any fixture would be skipped at insert. This is the silent
  failure the whole flow exists to catch: a GROUP fixture with no matchday is
  filed under matchday 1 by `ensureRounds` and looked up as `IS NULL` by
  `findRoundId`, so `upsertMatches` counts it in `skipped` and it never appears.
  *Any* loss blocks, not just total loss - a partially ingested competition looks
  like it works.
- `two_legged_knockout` - the same pair meeting twice at one knockout stage. The
  schema cannot hold it: `round` is unique on (competition, stage, matchday) and
  knockout rounds carry a null matchday, so the second leg has nowhere to go, and
  scoring has no notion of an aggregate winner. Ties are paired on team names,
  so undrawn slots are skipped rather than compared: ESPN names an undrawn side
  `TBD`, and a bracket published before its draw is all placeholders, which would
  otherwise read every undrawn tie at a stage as one tie played twice and refuse
  a perfectly ordinary tournament until the draw happened.
- `no_season` - no season could be resolved. Reported rather than probed anyway,
  because ESPN's scoreboard without a `dates` parameter serves the current day
  only: probing season-less would summarize one day of fixtures and report the
  competition as empty when it is the season lookup that failed.

Measured against the live ESPN API: World Cup 2026 104/104 ingestible and Euro
2024 51/51 (both supported); the Premier League 0/374 and the 2026 Champions
League 29/189 with two legs at R16, QF and SF (both rejected).

`isIngestible()` in `server/utils/sync/rounds.ts` derives the rule from
`roundDefForMatch()` and `findRoundId()` rather than restating it, so the probe
follows a change to either.

The create route (`server/api/admin/competitions/index.post.ts`) **re-probes
server-side** and refuses anything unsupported, rather than trusting a verdict
the client claims to have got - the guarantee is that nothing unsupported
reaches the `competition` table, not that the UI asked nicely. There is no
override: every blocker is a schema-level impossibility, and an override would
recreate the silent-loss bug the probe exists to prevent (see TODO.md for the
one legitimate case this shuts out, a competition whose fixtures are unpublished).

Slugs are suggested from the chosen name and season but validated hard
(`^[a-z0-9]+(?:-[a-z0-9]+)*$`, unique) and are **permanent**: every URL, the
`ng-competition` cookie, share images and push deep-links carry them.

Ordering matters more than it looks: `listActiveCompetitions` is what leads the
switcher *and* what `getDefaultCompetitionSlug` takes the head of when no default
is set. `season_hint` is nullable and Postgres sorts nulls FIRST on `DESC`, so
the query pins `NULLS LAST` and then breaks ties on the unique slug - otherwise a
season-less competition would quietly become the app-wide default, and two
competitions sharing a season would resolve in heap order, differing between
queries. The tiebreak is the slug rather than `createdAt` on purpose: two rows
inserted together share a timestamp, so ordering by it is decided by however the
inserts happened to land in time.

## Archiving, and why there is no delete

`isActive=false` hides a competition from the switcher, from
`listActiveCompetitions` and from the default resolver, keeping every
prediction, trophy, league and chat room attached to it.

There is deliberately no hard delete. `competition` cascades into `round`,
`match`, `competition_award`, `user_achievement` and `showcase_pin`, with
leagues and chat hanging off it, so deleting a row takes a tournament's whole
history with it. Archiving the current default is allowed by the API (the
resolver falls back to the newest active season) but blocked in the UI, which
asks the admin to choose a new default first so the move is never a surprise.

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

- `apps/web-nuxt/db/app-schema.ts` (`competition`, `round`, `match` tables and enums)
- `apps/web-nuxt/app/composables/useCompetitions.ts`
- `apps/web-nuxt/app/pages/[competition]/**`
- `apps/web-nuxt/app/middleware/competition.global.ts`
- `apps/web-nuxt/app/components/CompetitionPill.vue`
- `apps/web-nuxt/server/api/competitions/index.get.ts`
- `apps/web-nuxt/server/api/admin/competitions/default.put.ts`
- `apps/web-nuxt/server/utils/competitions/probe.ts`
- `apps/web-nuxt/server/utils/competitions/service.ts` (`addCompetition`: probe, then create)
- `apps/web-nuxt/server/utils/competitions/discovery.ts`
- `apps/web-nuxt/server/api/admin/competitions/` (list, create, discover, probe, `[slug]/active`)
- `apps/web-nuxt/server/utils/sync/rounds.ts` (`isIngestible`)
- `apps/web-nuxt/app/components/AdminCompetitionsSection.vue`
- `apps/web-nuxt/app/plugins/competition-meta.server.ts`
