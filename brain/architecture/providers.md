# Providers (external data)

Match data, odds and FIFA rankings come from external sources behind
provider-agnostic adapters. All of these are keyless and somewhat fragile (they
are unofficial or undocumented endpoints), so the quirks below are load-bearing.

## Match data: FIFA (default, keyless)

`api.fifa.com/api/v3` is the default provider. It needs no key.

- **Season resolution:** via `/seasons`, resolved by hint or date and cached on
  the `competition` row.
- **Group matchday:** FIFA's `MatchDay` field is null, so the group matchday is
  derived by date-within-group.
- **Per-match detail:** `/live/football/{comp}/{season}/{stage}/{match}` gives the
  goal timeline and possession. It needs the match's `providerStageId`, which
  must be captured at fixtures sync. Two traps: exclude **Period 11**
  (penalty-shootout goals) from the score, and the goal feed's `IdAssistPlayer`
  is the **beaten keeper, NOT an assister** - ignore it.
- **Knockout bracket:** `/seasonbracket/season/{id}`. Three traps. Its season-level
  `Winner` is **not the champion** - FIFA fills it as soon as the last semi-final
  resolves the final's placeholder slot, so trusting it crowns a winner before the
  final kicks off. Both providers read the champion off the final's own result
  instead (`normalizeFifaBracket`, `uefa.ts getBracket`). It also names the
  third-place tie **"Bronze final"**, while `/calendar/matches` names the same
  fixture **"Third-place play-off"** - the same match reaches the app under two
  names, so any "is this the third-place round?" test must know both (the
  `/third|3rd|bronze/` rung in [share-card.ts](../../apps/web-nuxt/shared/share-card.ts)
  and [stage.ts](../../apps/web-nuxt/server/utils/providers/stage.ts)). A name that
  only matches `final` maps to FINAL, and the tie then renders as a second final.
  And this feed **lags** `/calendar/matches`: it can still report a semi as LIVE
  with the next round's slots left as `PlaceHolderA/B` ("W102", "RU102") long
  after our own `match` rows carry the resolved teams. The bracket page shows the
  feed's names verbatim - see [bracket rendering](../features/competitions.md).
- **Player stats (top scorers + assists):** `getPlayerStats` has two sources.
  For the **live** edition it reads FIFA's "gameday" stats stories
  (`gameday-prod.fifa.mangodev.co.uk`): mint an anonymous ~24h Bearer token from
  the open `cxm-api.fifa.com/.../external/gameDay/token`, then fetch two
  ranked-page stories - `gcp_top_scorer:goals` (goals + assists) and
  `gcp_attack:assists` - and merge their actors by player id (`mergeGamedayStories`
  in `fifa.ts`). Stat values ride as `urn:gd:tag:football:stats:*` tags; the team
  code is the `team:abbreviation` tag. These stories 404 once an edition ends, so
  `getPlayerStats` then falls back to the **team-statistics** aggregate
  (`/statistics/teams/{id}`, tournament-wide despite the per-team path, needing
  any stored `goal_event` team id; `Type 1 = goals`, `Type 219 = assists`), which
  only publishes for a finished edition. Behind both, the `/api/competitions/scorers`
  route still falls back to the local `goal_event` aggregation. Both gameday hosts
  are CloudFront WAFs reached through the shared [cycletls engine](#the-shared-http-engine-cycletls).

`matches:finalize` fetches match details (bounded) into `goal_event` and
`match.possession*`. A football-data.org adapter exists as a fallback (its
`/scorers` needs a token; FIFA is keyless). An api-football adapter is mapped but
not implemented.

This feeds [../features/predictions-and-scoring.md](../features/predictions-and-scoring.md)
and [../features/best-scorer.md](../features/best-scorer.md).

## Match data: fixture (offline, e2e only)

`server/utils/providers/fixture.ts` serves a canned, fully decided 8-team
knockout tree and nothing else (no fixtures, no live). It exists because the
bracket is sourced from `getBracket()` over HTTP, which leaves an e2e spec
nothing to assert against without live network. Reached only by a competition
seeded with `provider='fixture'` - see
[../features/bracket.md](../features/bracket.md).

## Odds: Sofascore (primary), BetExplorer (backup)

- **Sofascore** unofficial JSON API is the primary odds provider (chosen
  explicitly over The Odds API: keyless and retroactive on finished matches, so
  historical seasons backfill). Verified ids: World Cup `uniqueTournament=16`
  (2026 season `58210`, 2022 `41087`), Euro `uniqueTournament=1`. Pattern:
  `/unique-tournament/{id}/season/{sid}/events/{next|last}/{page}` then
  `/event/{eid}/odds/1/all` (marketId 1 = Full time, 1/X/2). Display is decimal
  only.
- **BetExplorer** is a selectable provider (the admin odds switch) but has no
  server-side fetcher: it ships its 1X2 client-side only, with no plain-HTTP odds
  endpoint, so the poll skips any competition set to it (`fetchesOdds: false`). A
  snapshot's `bookmakers` field holds per-book prices when a provider supplies
  them; Sofascore always leaves it null, so median/consensus over the single feed
  does not apply.

See [../features/odds.md](../features/odds.md).

## FIFA ranking (for champion-pick tiers)

Used to snapshot a picked team's tier (see
[../features/champion-pick.md](../features/champion-pick.md)).

- `GET inside.fifa.com/api/ranking-overview?locale=en&dateId=idNNNNN` returns the
  full 211-team table (`rankings[].rankingItem.{countryCode,rank}`). The
  `www.fifa.com` host is dead (returns HTML); use `inside.fifa.com`.
- Historical `idNNNNN` ids work back to the 1990s, but the table is empty for the
  newer `FRS_Male_Football_YYYYMMDD` ids and when `dateId` is omitted.
- To get the latest publication's id:
  `GET inside.fifa.com/api/rankings/by-country?gender=male&countryCode=BRA&...`
  -> `rankings[0].IdSchedule`. A browser User-Agent header is required.

## The shared HTTP engine (cycletls)

Cloudflare-class WAFs (Sofascore, and many link-unfurl targets like 9gag) block
Node's default TLS by JA3 fingerprint. The shared engine
`apps/web-nuxt/server/utils/providers/cycle-tls.ts` uses **cycletls** (uTLS) with a Chrome JA3
to pass, exposing `cycleGet` / `withOk` / `cycleHeader`. It is used by both the
odds client and the chat link unfurl (see [../features/chat.md](../features/chat.md)).

Operational gotcha: cycletls' Go helper is glibc-linked, so the Alpine images
need `gcompat` (and `libstdc++`). It is installed in the Docker **base** stage so
dev, build and prod images all inherit it. If odds or unfurl return null in a
container, check that the running image actually has `gcompat` before blaming the
provider.

## Sources

- `apps/web-nuxt/server/utils/providers/**` (FIFA, football-data adapters, `cycle-tls.ts`)
- `apps/web-nuxt/server/utils/odds/providers/sofascore.ts`, `apps/web-nuxt/server/utils/odds/{sync,provider-config}.ts` (odds provider registry)
- `apps/web-nuxt/server/utils/champion/ranking.ts`
- `apps/web-nuxt/server/tasks/**` (`matches:finalize`, `fixtures:refresh`, `scores:poll`, `odds:*`)
