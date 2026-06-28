# Stats (player rankings)

A read-only "Stats" tab in the matches view
(`/[competition]/matches?view=stats`), alongside Fixtures and Standings. It shows
two side-by-side boards for the selected competition: top scorers (by goals) and
top assists. Built to grow into team-level boards (best attack/defense) later.

## Data

- Both boards are fed by the existing `/api/competitions/scorers` endpoint
  (`server/api/competitions/scorers.get.ts`), which returns `TopScorer[]`
  (`{playerName, teamName, teamCode, goals, assists, penalties}`), 10-minute
  cached per competition. No new server code.
- That endpoint prefers official FIFA player stats, then the local `goal_event`
  aggregation (`getCompetitionTopScorers` in `server/utils/stats/scorers.ts`),
  then a provider's own list. See [best-scorer.md](best-scorer.md) and
  [../architecture/providers.md](../architecture/providers.md).

## Client

- `useScorers(enabled)` (`app/composables/useScorers.ts`) mirrors `useStandings`:
  a `['scorers', slug]` query, lazily enabled so the fetch only fires once the
  Stats tab is open.
- `PlayerRankingTable.vue` renders one board. It takes the raw `TopScorer[]`, a
  `metric` (`'goals' | 'assists'`), re-ranks by that metric, drops zero rows, and
  slices to `limit` (default 15). Team flags via `flagUrl`, names via
  `formatPlayerName`.
- The tab lives in `app/pages/[competition]/matches/index.vue`: `viewMode` gained
  a `'stats'` value, mirrored to `?view=stats`. The view toggle only renders when
  the competition has group standings, so a knockout-only competition currently
  offers no Stats tab, and the assist board re-ranks the goals-sorted top set so a
  high-assist/low-goal player outside it can be missed (see `TODO.md`).

## Sources

- `app/pages/[competition]/matches/index.vue` (the `viewMode` toggle + Stats block)
- `app/composables/useScorers.ts`, `app/components/PlayerRankingTable.vue`
- `server/api/competitions/scorers.get.ts`, `server/utils/stats/scorers.ts`
- i18n: `matches.viewStats`, `stats.*` in `i18n/locales/{en,fr,th,tlh}.json`
