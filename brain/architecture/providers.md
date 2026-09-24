# Providers (external data)

Match data, odds and FIFA rankings come from external sources behind
provider-agnostic adapters (`createProvider` in
[factory.ts](../../apps/web-nuxt/server/utils/providers/factory.ts); an admin may
bind a competition to `fifa`, `uefa`, `espn`, `football-data` or `worldrugby`).
All but football-data are keyless and somewhat fragile (they are unofficial or
undocumented endpoints), so the quirks below are load-bearing.

Because they are undocumented, nothing warns us when one changes shape - and the
adapters are defensive enough that drift does not throw, it just quietly produces
less. A daily off-CI canary asks the live feeds directly:
[provider-canary.md](provider-canary.md).

## Match data: FIFA (default, keyless)

`api.fifa.com/api/v3` is the default provider. It needs no key.

- **Season resolution:** via `/seasons` (`resolveFifaSeasonId` ->
  `pickFifaSeason`: name hint, else the running edition, else the next, else the
  latest; throws on none), cached on `competition.externalSeasonId`
  (`resolveCompetitionSeason` in `server/utils/sync/competition.ts`).
- **Group matchday:** FIFA's `MatchDay` field is null, so the group matchday is
  derived by date-within-group.
- **Per-match detail:** `/live/football/{comp}/{season}/{stage}/{match}` gives the
  goal timeline and possession. It wants the match's `providerStageId`, captured
  at fixtures sync (the adapter falls back to the bare `/live/football/{match}`
  when none is passed, but `syncMatchDetails` only picks matches that carry one).
  Two traps: exclude **Period 11** (penalty-shootout goals) from the score, and
  the goal feed's `IdAssistPlayer` is the **beaten keeper, NOT an assister** -
  ignore it. Real assists come from one extra `/timelines/{match}` fetch, made
  only when there are goals (`mergeTimelineAssists`); a miss there leaves goals
  unassisted, but a 429 propagates so the match retries. Per-match team stats
  come from a third host, `fdh-api.fifa.com/v1/stats/match/{IdIFES}/teams.json`,
  keyed by the `IdIFES` the detail doc carries.
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
`match.possession*`. A football-data.org adapter exists as a fallback (it needs
`NUXT_FOOTBALL_DATA_TOKEN`; without one `createProvider` throws a
`ValidationError`, since the admin screen offers every provider), and an [ESPN adapter](#match-data-espn-keyless-whole-season-in-one-call)
covers the competitions ESPN carries, single-table leagues included. An
api-football key is plumbed through `ProviderSelection`, but `createProvider`
throws "not implemented" for it and it is not in `MATCH_PROVIDERS`.

This feeds [../features/predictions-and-scoring.md](../features/predictions-and-scoring.md)
and [../features/best-scorer.md](../features/best-scorer.md).

## Match data: UEFA (keyless)

`server/utils/providers/uefa.ts` reads `match.uefa.com/v5` (the API uefa.com
itself uses) with a `Mozilla/5.0` agent; `externalCompetitionId` is UEFA's
numeric competition id (`3` = EURO), `seasonHint` the `seasonYear`.

- **Fixtures** page `/v5/matches` 100 at a time and keep only
  `matchday.phase === 'TOURNAMENT'`: the qualifying play-offs share the season.
  UEFA is the one feed that publishes a matchday (`matchday.name` = `MD<n>`),
  so no `assignMatchdays` pass; `providerStageId` is the round id.
  `getLiveMatches` keeps LIVE/PAUSED only (no recently-finished window, unlike
  FIFA and ESPN).
- **Four hosts:** events and line-ups on `match.uefa.com`, the per-match team
  stats on `matchstats.uefa.com/v1/team-statistics/{id}` (falling back to an
  aggregate rebuilt from the event stream), the scorer and team rankings on
  `compstats.uefa.com/v1/{player,team}-ranking` (the player board paged 200 at
  a time, so it does not stop at ~200 players), the squad on `comp.uefa.com/v2/players`.
- **Line-ups** carry no formation and no captain, but every field player ships
  a real `fieldCoordinate` on a 0-1000 grid, so the XI is placed exactly.
- **The bracket** is rebuilt from the knockout fixtures by the shared
  `bracketFromKnockoutMatches`; there is no bracket endpoint.
- No `discoverCompetitions`: its ids are a curated handful, typed by the admin.

## Match data: ESPN (keyless, whole-season in one call)

`server/utils/providers/espn.ts` reads ESPN's public site API - keyless,
undocumented, no announced quota. `externalCompetitionId` is the ESPN league slug
(`fifa.world`, `uefa.euro`, `uefa.champions`), `seasonHint` the season year. It
implements the whole `MatchDataProvider` contract except `getMatchLineups`'
pitch coordinates: catalog discovery, fixtures, bracket, per-match detail,
timeline, line-ups, per-match team stats, the scorer board and the per-team
season aggregate. Every request carries a 20 s `AbortSignal.timeout`, since
`scores:poll` walks competitions serially and one hung socket would stall them
all. The
three fixture reads all go through one season fetch, so the derived group
matchdays always see a whole group rather than the slice one day or the live
poll would return.

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
- **ESPN publishes no matchday** (nor do FIFA and World Rugby; only UEFA does),
  and a group match without one is *dropped*:
  `ensureRounds` files group rounds under `matchday` 1..N while `findRoundId`
  looks a null matchday up as `IS NULL`, so it never matches and every group
  fixture is silently skipped at insert. The adapter runs the shared
  `assignMatchdays` (in `stage.ts`, also used by FIFA and World Rugby) over the
  whole season to derive it, and it has two shapes. With pool letters, each
  pool's fixtures are ordered by kickoff and paired off, two to a matchday.
  Without any, the competition is one table and a round is taken literally as
  "every team has played once": walk the fixtures in kickoff order, start a new
  round when a team would repeat. That needs no per-competition size and no date
  threshold, which a midweek round would break. A fixture moved out of its round
  lands in a later one, which is the same answer a date rule gives and the feeds
  carry nothing to do better with.
  Before this numbering, the live API's Premier League (374 fixtures) was 0%
  ingestible and the new-format Champions League 29/189; a single table now
  ingests, so the Champions League is refused only for its two-legged R16/QF/SF.
  The competition probe (`server/utils/competitions/probe.ts`) reports this
  before an admin can add such a competition - see
  [../features/competitions.md](../features/competitions.md).
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

### One summary document per match

`…/site/v2/sports/soccer/{league}/summary?event={id}` carries the play-by-play,
both line-ups, both teams' stats and the venue in a single response, so
`getMatchDetail`, `getMatchTimeline`, `getMatchLineups` and `getMatchStats` all
read it, and the adapter memoizes it per match. Note what that memo does and does
not buy: `providerForCompetition` builds a fresh adapter per HTTP request, so the
memo collapses the method *pairs inside one route* (live-detail's detail + stats,
timeline's detail + timeline) but not across routes - a first match-page render
still costs three summary requests, one per route. `getMatchDetail` hands its own
event id back as `ifesId` precisely so `getMatchStats` hits that memo instead of
fetching again. A failed fetch is evicted rather than cached. The memo has no TTL
or size bound because an instance lives for one request; anything that starts
pooling adapters has to revisit it, or a LIVE match freezes at its first fetch. The parsing lives in
[espn-summary.ts](../../apps/web-nuxt/server/utils/providers/espn-summary.ts) as
pure functions over the document.

- **Events are typed by a numeric id**, not by their English text: 97 own goal,
  98 penalty scored, 99 penalty missed, 94/95/93 the cards, 76 a substitution,
  80-84 and 87 the period markers. The goal variants named after the finish
  ("Goal - Header") are recognised by `scoringPlay` rather than one id each, and
  VAR decisions by a `type.text` starting "VAR". Types 129/130 (delay opened,
  delay closed) wrap every VAR check and injury and run to several hundred
  entries per match - they are dropped, as are 85/86, the extra-time interval
  markers the app has no kind for (`espnEventKind`).
- **An own goal sits under the team it benefits** while the scorer is on the
  other roster, the same convention FIFA uses. Verified against the real feed: in
  USA 4-1 Paraguay the own goal carries `team.id` = USA and names the Paraguay
  player. A goal whose team matches neither side is dropped rather than guessed
  onto one - it feeds both the scoreline and the scorer aggregation. Checked
  across 24 finished matches, the play-by-play goals equal the scoreboard in all
  of them.
- **A substitution names the player coming on first**, then the one going off.
- **"End Regular Time" is full time** for a match that never went to extra time,
  and only the end of the second half for one that did; the parser decides by
  looking for an extra-time start in the same document.
- **The timeline's running score is accumulated**, not parsed out of the
  commentary text. The provider's free text is kept only for VAR rows, the one
  kind the app cannot phrase from structure.
- **ESPN publishes no captain flag and no pitch coordinates**, so `SquadPlayer`
  gets `captain: false` and no `x`/`y`; the pitch falls back to formation bands
  from the roster's `formation` (UEFA is the reverse: coordinates, no
  formation). The match rosters carry no coach either - that only comes
  from the team endpoint, so a line-up's `coach` is null while the team page's is
  not. Bench players are all position `SUB`, so only the starting XI has real
  positions.

- **A shootout leaves no per-kick events.** The summary emits type 88 "Start
  Shootout" and 89 "End Match" and nothing between them, so the spot kicks cannot
  leak into the timeline or the goal list; the shootout score comes from the
  scoreboard's `shootoutScore` instead. Every keyEvent does carry a `shootout`
  field, but it is always false - the guard on it is cheap defence, not the thing
  doing the work. Checked against all four shootouts of the 2026 edition.
- **ESPN matches carry a synthetic `providerStageId`** (the season slug). ESPN has
  no stage concept, but `syncMatchDetails` only considers matches whose
  `providerStageId` is set, so leaving it null means `goal_event` is never
  written, the scorer board never builds from local data and the Golden Boot bonus
  never pays out. The adapter's own `getMatchDetail` ignores the value.
- **The timeline is returned newest-first**, like FIFA's and UEFA's - the route
  documents that order and the play-by-play component does no sorting of its own.
  The running score has to be accumulated forwards, so the parser reverses last.
- **VAR commentary is English only**, so it is passed through solely when the
  reader's locale is English; every other locale gets the client's generic label
  rather than an untranslated sentence in the middle of a translated timeline.

### The season boards live on the other API

The scorer board and the per-team season aggregate exist only on
`sports.core.api.espn.com`, the hyperlinked one, and that changes their cost.

- **`getTopScorers` / `getPlayerStats`** read
  `…/seasons/{year}/types/1/leaders` -> `goalsLeaders`, 25 entries, each a `$ref`
  to an athlete and a team rather than a name. That is **one request per player**
  plus the teams (cached within the call, since a top-25 board repeats clubs
  heavily; a `$ref` is only followed when it points back at the core API host,
  so a spoofed response cannot make the server fetch an arbitrary URL), so roughly 26-30 requests against the single request FIFA and UEFA
  each need. Be careful about what that costs in wall clock: the adapter's main
  limiter spaces requests a second apart, which would make this a ~30 second read
  route, so the `$ref` hops run on their own much tighter limiter and the board is
  capped at 25 rows. `/api/competitions/scorers` tries `getPlayerStats` **before**
  the local `goal_event` aggregation, not after, so this path is reached whenever
  its 10-minute cache has expired. The local fallback only has data because
  `matches:finalize` keeps `goal_event` populated, which in turn is only true
  because ESPN matches carry a `providerStageId` (see above). Assists are read out of the board's
  own label ("M: 8, G: 10: A: 4") to avoid a second `$ref` hop per player.
- **`getTeamTournament`** maps the app's three-letter code to ESPN's numeric id
  through `…/{league}/teams` (48 entries, memoized per instance), then reads the
  squad and head coach from `…/teams/{id}/roster` and the season aggregate from
  `…/seasons/{year}/types/1/teams/{id}/statistics`. The aggregate arrives as
  categories to be flattened; `passPct` is a fraction where the app wants a
  percentage. The `matches` argument the caller passes is ignored: it only
  contains fixtures that carry a `providerStageId`, which ESPN has no concept of,
  so it is always empty.
- **`getBracket`** needs no endpoint at all (there is none). The tree is built
  from the knockout fixtures the adapter already has, by the shared
  `bracketFromKnockoutMatches` in
  [bracket-order.ts](../../apps/web-nuxt/server/utils/providers/bracket-order.ts),
  which UEFA now uses too - it had its own copy of the same walk.

## Match data: World Rugby (keyless, the whole tournament in one call)

`api.wr-rims-prod.pulselive.com/rugby/v3` - the Pulselive (RIMS) backend that
rugbyworldcup.com and world.rugby themselves run on. Chosen over ESPN's rugby
feed because it is the official stream and carries, in one place, the three
things the app needs and ESPN does not hand over together: typed pool letters, a
typed bronze final, and the World Rugby rankings that will drive champion tiers.

- **One document per tournament:** `/event/{id}/schedule` returns the whole
  fixture list, so `listFixtures` ignores its `season` argument - the event id
  already pins the season. `getBracket` and `getLiveMatches` filter that same
  document rather than calling anything else.
- **Events are addressed by uuid.** The catalog lists a legacy numeric `id`
  (`1893` = RWC 2023) beside a uuid `altId`, and the `/event/{id}/...` routes now
  answer 400 ("Invalid UUID string") to the numeric one. Discovery stores the
  `altId`; a competition bound before the migration still holds the number, so
  `eventUuid()` swaps it for its `altId` by walking the catalog (five pages,
  memoised, re-armed on failure). `externalCompetitionId` stays opaque text.
- **Phases are typed, except when they are not.** `eventPhaseId` gives
  `{type: "Pool", subType: "A"}` for pools and `Quarter` / `Semi` /
  `Final:Final` / `Final:Bronze` for the knockout. The 2027 World Cup's new
  **round of 16** arrives with `eventPhaseId: null` and only an `eventPhase`
  label ("Round of 16 (1)"), so the typed field is authoritative when present
  and the label is the fallback. A pool whose letter goes missing is worse than
  it sounds: `assignMatchdays` takes a competition down the pool path as soon as
  ANY fixture carries a letter, and the letterless ones there keep a null
  matchday and are dropped at insert.
- **`[0, 0]` means "not played", not a goalless draw.** The feed sends zeros for
  every unplayed match, so the score is only taken once the status says the
  match started. Taken at face value it settles predictions on unplayed fixtures.
- **Status codes:** only `C` (complete) and `U` (upcoming) have been observed on
  a live feed - nothing was in play when the adapter was written. The in-play
  codes are mapped from the same Pulselive vocabulary used elsewhere, and
  anything unrecognised falls through to `SCHEDULED`, never `FINISHED`.
- **Discovery:** `/event?page&pageSize=100&sort=desc` enumerates ~2400 events,
  each tagged with a sport code (`mru` men's union, `wru` women's, `jmu`/`jwu`
  U20, `mrs`/`wrs` sevens, `mjs`/`wjs` junior sevens; the list is
  `PROVIDER_SPORTS` in `shared/sport.ts`). The adapter filters to its own sport
  and stops after five pages - an admin is choosing a season to run, not browsing an archive.
- **Rankings:** `/rankings/{sport}` gives the World Rugby table (114 men's
  sides, 70 women's) as `{team: {abbreviation}, pos}` - the same three-letter
  alphabet the match feed uses, so a champion pick's code looks up directly.
  `champion/ranking.ts` picks the table from the competition's sport and caches
  per source key, since men's and women's are different tables under codes of
  the same shape. The sevens feeds answer 400; that surfaces as null ranks,
  which the champion routes already treat as "use the flat bonus".
- **Match detail** comes from three documents: `/match/{id}` (venue,
  attendance, team ids), `/match/{id}/timeline` (scoring entries carry `points`
  and a `group` of `try` / `con` / `pen` / `dg`, plus `Miss Con`, `Miss Pen`,
  `Yellow`, `Red`, `Sub On`/`Sub Off`), and `/match/{id}/stats` (137 team
  figures, possession among them). Three things the mapping has to get right:
  - **Every scoring play becomes a `goal_event`, with its `points`**, not just
    the tries: the try board counts the rows worth at least a try
    (`TRY_POINTS` in `server/utils/stats/scorers.ts`) and the points board sums
    them, so neither turns into a kickers board. See
    [../features/rugby.md](../features/rugby.md).
  - **A conversion is its own timeline line** (`mapWorldRugbyTimelineKind`:
    try, conversion, penalty kick, drop goal, and the missed conversion and
    penalty): a converted try is two plays by two players. The running score
    sums every entry's `points`, so it lands on the real full-time score.
  - **Substitutions pair on `link`, not on the clock.** Both halves carry the
    same link id, and `Sub On` is emitted *before* its `Sub Off`, so a running
    map never has the partner yet. An unpaired half still ships (a blood
  replacement, or a player off with no cover).
- **Squads:** `/event/{id}/squads` gives every squad for the tournament, with
  `management[].role` naming the head coach (anchor the match - the roles also
  include "Head Strength & Conditioning Coach"). One call serves both the squad
  list and the player-id -> name map every timeline needs, so it is memoised per
  adapter. A tournament whose squads are not named yet answers with empty ones:
  RWC 2027 has 24 squads and 0 players today.
- **The squad list is the initial selection**, so a scorer can be missing from
  it: Makazole Mapimpi is not among RWC 2023's 658 squad players, and his tries
  stored with an empty name. Ids the bulk map does not answer are resolved one at
  a time from `/player/{id}` (`name.display`), memoised including the misses, and
  capped at six per adapter. The cap matters because the lookups are serial
  behind the rate limiter: an empty squad document is skipped outright rather
  than named player by player, which would be a minute inside one request and a
  429 at the end of it. See [../features/rugby.md](../features/rugby.md).
- **`providerStageId` carries the event id**, though the feed addresses a match
  by its own id alone. Without it `sync/details.ts` - which selects on
  `providerStageId IS NOT NULL` - skips every rugby match silently, and the
  team page's `getTeamTournament` is handed no matches.
- **Line-ups** come from `/match/{id}/summary`, whose `teams[].teamList.list`
  is the 23-man team sheet plus the head coach - the coach being the one entry
  with no number. Three traps: `number` is a numeric STRING here while the same
  key in `/event/{id}/squads` holds a position code ("SR", "CE"); `captainIds`
  are **altIds**, so matching them against `player.id` finds nobody; and the
  `order` field is not a line-up order (its values run past 38), so the split is
  by shirt number - 1-15 start, 16-23 are the bench, which in rugby union is the
  position rather than a squad-list convention.
- **Rugby positions are dropped.** `SquadPlayer.position` is GK/DF/MF/FW and a
  hooker is none of them, so the feed's `positionLabel` has nowhere to go.

A competition names its sport twice for different reasons: `competition.sport`
(the `sport` pg enum, `FOOTBALL` / `RUGBY_UNION`) is looked up from the provider
and drives ranking source, scoring preset and theme; `competition.providerSport`
is the sub-feed within that provider, and only World Rugby has more than one.
See [../../apps/web-nuxt/shared/sport.ts](../../apps/web-nuxt/shared/sport.ts).

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
  `/unique-tournament/{id}/seasons` (the season id picked by the competition's
  year hint), then `/unique-tournament/{id}/season/{sid}/events/{next|last}/{page}`, then
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
`apps/web-nuxt/server/utils/providers/cycle-tls.ts` uses **cycletls** (uTLS) to send a
chosen JA3, exposing `cycleGet` / `withOk` / `cycleHeader` and a desktop-Chrome
`CHROME_JA3` + `CHROME_UA` pair. FIFA's gameday stats stories and the chat link
unfurl (see [../features/chat.md](../features/chat.md)) use the Chrome pair.
Sofascore (`sofascore-http.ts`, odds and line-ups) uses its own allow-listed
curl JA3 with an honest `curl/8.15.0` User-Agent, since a browser UA over a
non-browser handshake is what gets blocked.

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

- [provider-canary.md](provider-canary.md) (the daily shape check over the live feeds)
- `apps/web-nuxt/server/utils/providers/**` (FIFA, UEFA, ESPN, football-data, World Rugby adapters, `factory.ts`, `stage.ts`, `bracket-order.ts`, `cycle-tls.ts`)
- `apps/web-nuxt/server/utils/sync/{competition,details,rounds}.ts` (season cache, the `providerStageId` detail gate, round lookup)
- `apps/web-nuxt/server/utils/stats/scorers.ts` (`TRY_POINTS`, the rugby try/points boards)
- `apps/web-nuxt/shared/sport.ts` (sport enum mirror, per-provider sub-feeds)
- `apps/web-nuxt/server/utils/providers/worldrugby-ranking.ts`, `apps/web-nuxt/server/utils/champion/ranking.ts` (per-sport ranking source)
- `apps/web-nuxt/app/components/LogoMark.vue`, `apps/web-nuxt/app/components/logos/LogoRugby.vue` (the mark follows skin, then sport)
- `apps/web-nuxt/server/utils/competitions/discovery.ts` (catalog, cached per provider and sub-feed)
- `apps/web-nuxt/server/utils/odds/providers/sofascore.ts`, `apps/web-nuxt/server/utils/odds/{sync,provider-config}.ts` (odds provider registry)
- `apps/web-nuxt/server/utils/champion/ranking.ts`
- `apps/web-nuxt/server/tasks/**` (`matches:finalize`, `fixtures:refresh`, `scores:poll`, `odds:*`)
