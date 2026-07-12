# Stats (player rankings)

A read-only "Stats" tab in the matches view
(`/[competition]/matches?view=stats`), alongside Fixtures and Standings. It shows
two side-by-side boards for the selected competition: top scorers (by goals) and
top assists. Built to grow into team-level boards (best attack/defense) later.

## Data

- Both boards are fed by the `/api/competitions/scorers` endpoint
  (`apps/web-nuxt/server/api/competitions/scorers.get.ts`), which returns `PlayerRankings`
  (`{scorers, assists}`, each a `TopScorer[]` of
  `{playerName, teamName, teamCode, goals, assists, penalties}`), 10-minute
  cached per competition.
- The endpoint prefers official player stats (FIFA `getPlayerStats`: the live
  edition's gameday stories, else the finished-edition aggregate - see
  [../architecture/providers.md](../architecture/providers.md); UEFA's full
  `player-ranking`), then the local `goal_event` aggregation, then a provider's
  own list - then splits whichever source it used into the two boards with
  `rankPlayers` (`apps/web-nuxt/server/utils/stats/scorers.ts`). Each
  board is sorted and sliced on its **own** metric (goals desc / assists desc,
  the other metric then name as tie-break), so a high-assist/low-goal player
  isn't capped out by the goals ranking. The local path uses
  `getCompetitionPlayerRankings`; `getCompetitionTopScorers` still returns the
  goal-ranked list (own goals excluded, pure assisters kept) for per-team
  callers. See [best-scorer.md](best-scorer.md) and
  [../architecture/providers.md](../architecture/providers.md).
- A single match's "Players" tab (`apps/web-nuxt/app/pages/[competition]/matches/[id].vue`) is
  a different, fixture-scoped board: it lists every scorer and assister of the
  two teams playing, **unsliced**. It has its own endpoint
  (`/api/matches/[id]/scorers` -> `getMatchPlayerRankings` ->
  `getTeamsPlayerRankings`, both in `apps/web-nuxt/server/utils/stats/scorers.ts`) rather than
  the competition top-20 board - filtering the tournament-wide top-N to one team
  hid teams whose scorers ranked outside it. Local `goal_event` only (no FIFA
  path), so it is as complete as the stored goal events for finished matches.

## Client

- `useScorers(enabled)` (`apps/web-nuxt/app/composables/useScorers.ts`) mirrors `useStandings`:
  a `['scorers', slug]` query, lazily enabled so the fetch only fires once the
  Stats tab is open. Its data is the whole `{scorers, assists}` object.
- `PlayerRankingTable.vue` renders one board. It takes a `TopScorer[]` (already
  ranked for its `metric` of `'goals' | 'assists'`), drops zero rows, and slices
  to `limit` (default 15). The displayed `#` is standard competition ranking
  ("1224"): players level on the metric share a rank and the next distinct value
  skips, so four players on 4 goals all read joint-2nd and the next is 6th. Team
  flags via `flagUrl`, names via `formatPlayerName`.
- The tab lives in `apps/web-nuxt/app/pages/[competition]/matches/index.vue`: `viewMode` gained
  a `'stats'` value, mirrored to `?view=stats`. The view toggle only renders when
  the competition has group standings, so a knockout-only competition currently
  offers no Stats tab (see `TODO.md`).

## Sources

- `apps/web-nuxt/app/pages/[competition]/matches/index.vue` (the `viewMode` toggle + Stats block)
- `apps/web-nuxt/app/composables/useScorers.ts`, `apps/web-nuxt/app/components/PlayerRankingTable.vue`
- `apps/web-nuxt/server/api/competitions/scorers.get.ts`, `apps/web-nuxt/server/utils/stats/scorers.ts`
- `apps/web-nuxt/server/api/matches/[id]/scorers.get.ts` (the fixture-scoped Players tab board)
- i18n: `matches.viewStats`, `stats.*` in `shared/i18n-json/{en,fr,th,tlh,ar}.json`
