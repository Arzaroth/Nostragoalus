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
  code is the `team:abbreviation` tag. These stories 404 once an edition ends - and
  the two rebuild independently after a matchday, so a goals-story lag leaves an
  assists-only, `goals:0` board - so `getPlayerStats` only trusts the gameday result
  when it carries at least one scorer (`live.some(p => p.goals > 0)`), else it falls
  back to the **team-statistics** aggregate
  (`/statistics/teams/{id}`, tournament-wide despite the per-team path, needing
  any stored `goal_event` team id; `Type 1 = goals`, `Type 219 = assists`), which
  only publishes for a finished edition. Behind both, the `/api/competitions/scorers`
  route still falls back to the local `goal_event` aggregation. Both gameday hosts
  are CloudFront WAFs reached through the shared [cycletls engine](#the-shared-http-engine-cycletls).

`matches:finalize` fetches match details (bounded) into `goal_event` and
`match.possession*`. A football-data.org adapter exists as a fallback (its
`/scorers` needs a token; FIFA is keyless), and an [ESPN adapter](#match-data-espn-keyless-whole-season-in-one-call)
covers fixtures for the group-and-knockout competitions ESPN carries. An api-football adapter is
mapped but not implemented.

This feeds [../features/predictions-and-scoring.md](../features/predictions-and-scoring.md)
and [../features/best-scorer.md](../features/best-scorer.md).

## Match data: ESPN (keyless, whole-season in one call)

`server/utils/providers/espn.ts` reads ESPN's public site API - keyless,
undocumented, no announced quota. `externalCompetitionId` is the ESPN league slug
(`fifa.world`, `uefa.euro`, `uefa.champions`), `seasonHint` the season year.
Fixtures only: it implements `listFixtures` / `getMatchesByDate` /
`getLiveMatches` and none of the optional detail methods. All three read one
season fetch, so the derived group matchdays always see a whole group rather than
the slice one day or the live poll would return.

- **One call per sync.** `…/site/v2/sports/soccer/{league}/scoreboard?dates=YYYY`
  returns the whole season (104 events for the 2026 World Cup). `dates` also takes
  `YYYYMMDD` and `YYYYMMDD-YYYYMMDD` (both bounds included); **without `dates` the
  endpoint serves the current day only**. `limit` defaults to 100 - we send 500, or
  a 104-match tournament loses its tail.
- **The User-Agent is filtered, in HTML.** An Akamai in front of the API 403s on
  the agent and answers `<TITLE>Access Denied</TITLE>`, not an error JSON, so a
  reader expecting JSON sees a parse failure rather than a refusal. Branded and
  browser-shaped agents are refused; the adapter sends `curl/8.0`. If every ESPN
  call starts failing with a 403 carrying HTML, suspect this before the endpoint.
- **A scheduled match reports `score: "0"`** on both sides, not null - and so does
  a postponed or cancelled one. The adapter only reads the scoreline once
  `matchHasStarted()` says the match was actually played, which is the same
  predicate the rest of the app uses and which excludes the never-played
  terminals (POSTPONED / CANCELLED / AWARDED).
- **Postponed and abandoned arrive as `state: "post"`**, exactly like a finished
  match; only `status.type.name` separates them, so the state alone would show a
  full-time card for a match that never kicked off. Inside `post` the name decides,
  and inside `in` an unknown name reads as LIVE, never as final. The name is an
  upstream-controlled key, so the lookup is a `Map`: a plain object literal
  resolves `constructor` or `toString` to an inherited function.
- **The stage is `event.season.slug`** (`group-stage`, `round-of-32`,
  `quarterfinals`, `3rd-place-match`, `final`): hyphens out, then the shared ladder
  in [stage.ts](../../apps/web-nuxt/server/utils/providers/stage.ts) reads it.
- **No feed publishes a matchday**, and a group match without one is *dropped*:
  `ensureRounds` files group rounds under `matchday` 1..N while `findRoundId`
  looks a null matchday up as `IS NULL`, so it never matches and every group
  fixture is silently skipped at insert. The adapter runs the shared
  `assignGroupMatchdays` (in `stage.ts`, also used by FIFA) over the whole season
  to derive it. That helper keys off the group letter, so **a competition with no
  groups - a domestic league - cannot be synced today**: its fixtures are all
  GROUP-stage with no letter, get no matchday, and would be skipped. ESPN's league
  coverage is therefore not yet usable; see TODO.md.
- **The group letter is not on the scoreboard.** It comes from a second call,
  `…/apis/v2/sports/soccer/{league}/standings` (**`apis/v2`, not `apis/site/v2`** -
  the site path also answers 200, with an almost-empty object), whose `children[]`
  are the groups; the adapter builds a team-id -> letter map, memoized per
  instance and skipped entirely when nothing is at the group stage. A standings
  failure **fails the whole run** on purpose rather than degrading to "no letters":
  `groupName` is a mutable upsert field, so returning null would blank the stored
  letter for every live match on the next poll, and a letter-less group match gets
  no matchday and is skipped at insert. Losing one tick is cheaper than losing the
  group table. Matching the group name uses the strict `parseGroupNameStrict`
  (`^group [a-l]$`), not the loose `parseGroupLetter`, because a domestic league's
  standings children are named after the league and `Premier League` ends in a
  letter the loose parser reads as group E.
- **The group letter is attached to group-stage matches only.** The map is keyed by
  team and a team carries its letter into the knockouts, so an ungated join would
  stamp "Group A" on a Round of 16 tie - and `server/api/teams/[code].get.ts`
  selects group-table rows by `groupName` with no stage filter, which would pull
  that knockout result into the group standings.
- **Half-time is derived**, not served: `competitions[0].details[]` carries every
  goal with `clock.displayValue` and `scoreValue`, so goals up to 45' sum to the
  half-time pair (shootout entries carry `shootout: true` and are excluded). ESPN
  credits an own goal to the side it benefits, so no side-swap is needed. It is
  left **unset, not zeroed**, whenever the answer would be a guess - no `details`
  at all (routine for older or smaller competitions), a goal with no minute, or a
  goal whose team id matches neither side - because a stored 0-0 is
  indistinguishable from a real goalless half. Verified against all 64 matches of
  the 2022 World Cup, and against the 2026 edition, where 96 of 104 matches yield
  a half-time and the other 8 publish no details.
- **Penalties** are `competitors[].shootoutScore`, stored only when the two sides
  sum above zero: ESPN sends `shootoutScore: 0` on ordinary matches, and writing
  that through marks every match as decided on penalties (the same trap FIFA and
  UEFA already guard). `competitors[].score` is the 120-minute scoreline, which
  lands in `fullTime` as it does for FIFA and UEFA.
- **A draw is only a draw when the scoreline says so.** ESPN omits the `winner`
  boolean on some events, so deriving DRAW from a FINISHED status alone records a
  2-1 as a draw; the adapter requires the two full-time scores to be level.
- **`getLiveMatches` keeps the matches that just finished**, not only the in-play
  ones: a LIVE/PAUSED-only feed never carries the final whistle, so the row would
  stay LIVE until the hourly fixtures refresh. Same 4h recent-kickoff window as
  FIFA, which covers extra time plus penalties.

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

Operational note: cycletls' Go helper is glibc-linked, and cycletls spawns it via
`/bin/sh -c` (`shell: true` on non-Windows). The Docker images run on `node:22-slim`
(real glibc plus a shell), so the helper links native `libc.so.6` with no musl shim
and the `sh` spawn works - the earlier Alpine builds needed a `gcompat` +
`libstdc++` shim, since dropped. A distroless prod base was rejected for exactly
this: it has glibc but no `/bin/sh`, so the spawn dies with `spawn /bin/sh ENOENT`
on the first odds/unfurl call. Nitro traces the helper's JS but not its spawned
binary, so the prod stage copies this arch's Go helper (`cycletls/dist/index`,
pruned to one by `TARGETARCH`) into `.output`. If odds or unfurl return null in a
container, check that binary is present before blaming the provider.

## Sources

- `apps/web-nuxt/server/utils/providers/**` (FIFA, UEFA, ESPN, football-data adapters, `cycle-tls.ts`)
- `apps/web-nuxt/server/utils/odds/providers/sofascore.ts`, `apps/web-nuxt/server/utils/odds/{sync,provider-config}.ts` (odds provider registry)
- `apps/web-nuxt/server/utils/champion/ranking.ts`
- `apps/web-nuxt/server/tasks/**` (`matches:finalize`, `fixtures:refresh`, `scores:poll`, `odds:*`)
