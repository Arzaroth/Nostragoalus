# Match detail page

`/[competition]/matches/[id]` is the one-match view: a score header with the
live clock, the event timeline, your pick, reactions and a tab strip (watch
links, play-by-play, line-ups, stats, group table, per-match ranking, form, next
fixtures, head-to-head, players). Almost everything below the header is read
**live from the competition's provider** per request and cached in memory; only
the scoreline, goals, possession and line-ups are persisted. Back to the
catalog: [index.md](index.md).

Related: [../architecture/providers.md](../architecture/providers.md) (the
adapters behind every section) ·
[../architecture/realtime.md](../architecture/realtime.md) (the WS score patch) ·
[live-viewers.md](live-viewers.md) · [reactions.md](reactions.md) ·
[match-media.md](match-media.md) (watch links) · [multiview.md](multiview.md) ·
[rugby.md](rugby.md#the-match-view) · [odds.md](odds.md) ·
[predictions-and-scoring.md](predictions-and-scoring.md).

## Shape of the page

`apps/web-nuxt/app/pages/[competition]/matches/[id].vue` issues one blocking fetch
and several lazy ones, so navigation is instant and sections fill in as their
(slower, provider-backed) data lands. `useCancelOnLeave` aborts the lazy ones when
you leave.

| Fetch | Route | Source | Feeds |
|---|---|---|---|
| blocking | `GET /api/matches/[id]` | DB (`getMatchDetail`, `server/utils/matches/service.ts`) | header, your pick, odds, `isLocked` (server clock) |
| lazy | `/insights` | DB (`getMatchInsights`, `server/utils/stats/insights.ts`) + FIFA archive (`server/utils/stats/alltime-h2h.ts`) | stored goals, possession, group table, form, next, head-to-head |
| lazy | `/live-detail` | provider `getMatchDetail` + `getMatchStats` | live goals, bookings, subs, venue, attendance, cards, stat rows, clock |
| lazy | `/scorers` | DB `goal_event` (`getMatchPlayerRankings`, `server/utils/stats/scorers.ts`) | Players tab |
| on tab open | `/timeline` | provider `getMatchTimeline` (+ `getMatchDetail` for sides and names) | Play-by-play tab |
| on tab open | `/league-standings` | DB (`server/utils/leaderboard/match.ts`) | Ranking tab |
| vue-query | `/lineups` | `match_lineups` row, else provider `getMatchLineups` + Sofascore | Line-ups tab |
| vue-query | `/media` | `match_media` | watch tabs, see [match-media.md](match-media.md) |

All routes live in `apps/web-nuxt/server/api/matches/[id].get.ts` and
`apps/web-nuxt/server/api/matches/[id]/`. The provider-backed ones resolve the
adapter with `providerForCompetition` and degrade to an empty/`null` payload on
any upstream failure: an outage empties a section, never 500s the page. The
timeline route additionally logs the failure (a silently empty tab was
undiagnosable).

## Header

- **Score.** While the match is in play (`matchIsInPlay`) the header shows
  `liveHeaderScore` (`apps/web-nuxt/app/utils/live-score.ts`): the goal count from
  the detail/insights feed once it has landed, the WS/stored score before that.
  This keeps the header in lockstep with the event list under it when VAR strikes
  a goal off; the why is in [../decisions.md](../decisions.md) and
  [../architecture/realtime.md](../architecture/realtime.md). Outside play it is
  the stored full-time score. The WS value comes from `useLiveMatch` (a
  `subscribe` frame, `match:update` pushes from the 30 s `scores:poll`), which also
  drives the status tag and the live shootout line.
- **Live clock** under the score: `liveClockSpec` (`apps/web-nuxt/app/utils/match-view.ts`)
  gives half-time, the provider's running minute, or a bare LIVE.
- **Goal celebration.** A rise in the displayed total fires the full-screen
  `GoalAnimation` for 6 s and refreshes insights, detail and the ranking. The
  first reading only seeds the baseline, and it is suppressed while an embedded
  live stream is on screen (pinned, or the LIVE tab open), so it never covers or
  spoils the broadcast.
- **Viewers**: `MatchViewers` from `useMatchPresence`, only while in play. See
  [live-viewers.md](live-viewers.md).
- **Event timeline** under the teams: `buildTimeline` interleaves goals (live
  detail first, stored `goal_event` via insights as fallback), bookings and
  substitutions by minute, laced onto each team's side. Bookings and subs can be
  hidden (`ng-timeline-bookings` / `ng-timeline-subs` in localStorage). It waits
  for both insights and detail to settle so rows don't pop in piecemeal. Score
  glyphs follow the sport, see [rugby.md](rugby.md#the-match-view).
- **Your pick**: `ScoreInput` plus the joker toggle while `canPredict` (not
  `isLocked`, still `SCHEDULED` by the live status, both team codes known), so the
  input locks at kickoff even with the page already open. Afterwards the locked
  pick and its points/tier, `PastPickHint`
  ([past-pick-counterfactual.md](past-pick-counterfactual.md)),
  `SharePickButton` ([share-images.md](share-images.md)), `CrowdLine`
  ([crowd-bot.md](crowd-bot.md)) and `MatchOdds` ([odds.md](odds.md)), each behind
  its own preference. Scoring and joker rules: [predictions-and-scoring.md](predictions-and-scoring.md).
- **Reactions**: `ReactionBar` from kickoff on, scoped by the `LeaguePill`. See
  [reactions.md](reactions.md).

## Tabs

The open tab is in the URL (`?tab=`, omitted for the default `stats`). With no
explicit tab a live match opens on the play-by-play; a match with no stats falls
back to `form`.

- **Watch (LIVE / REPLAY / HIGHLIGHTS)**: one tab per kind that has a link and is
  visible for the status; a pin lifts the stream above the tabs. Admin editing
  (`MatchMedia`) sits below the tabs. See [match-media.md](match-media.md).
- **Play-by-play** (once started): `app/components/match/PlayByPlay.vue`, newest
  first, loaded only when the tab is first opened. The route caches per match and
  language for 60 s while live and forever once `FINISHED` with events (an empty
  finished result stays refetchable). The commentary is phrased client-side from
  i18n keys (`pbpTextSpec`); only the VAR decision text comes from the feed, in
  `en`/`fr` (read from the `ng_locale` cookie), so the page refetches on a locale
  change. The same component renders compact in the [multiview](multiview.md)
  tile.
- **Line-ups** (only once the feed answers `available: true`, about an hour before
  kickoff): `MatchLineups.vue` puts each XI on a half-pitch (`PitchHalf.vue`,
  `LineupPlayer.vue`) at real coordinates when every starter has one, else in
  formation bands (`pitchRows`, `apps/web-nuxt/app/utils/lineup.ts`), plus bench and
  coach. See [Line-ups](#line-ups) below.
- **Stats**: venue, attendance and card counts, the possession bar (stored
  `match.possession*`, falling back to the live stats since the stored value is
  empty mid-match; the uncontested remainder is an "in contest" segment) and the
  per-team stat rows (attempts, passes, pass accuracy, distance, pressures...)
  from `getMatchStats`. Skeletons while the detail loads.
- **Standings** (group-stage matches): the group table with in-progress matches
  folded in provisionally (`computeGroupStandings(..., { includeLive: true })`).
- **Ranking** (once started): picks ranked by the points they earn on this match,
  provisional while live. With a league selected it is that league's members
  (members/admins only, private profiles included); without, every visible
  public picker. Loaded only while the tab is open.
- **Form**: each team's last results across all international football before
  this kickoff (`getTeamRecentResults`), else the last 5 inside the competition.
- **Next**: each team's next 3 competition matches after this one, relative to the
  viewed match, so browsing history shows results.
- **Head-to-head**: the all-time tally and meeting list from FIFA's Data Centre
  archive (`getAllTimeHeadToHead`, cut off at kickoff), linked to our own match
  page where we hold that fixture; our own cross-competition meetings as the
  fallback. The FIFA enrichment runs for `FOOTBALL` competitions only, so rugby
  shows only its own meetings and in-competition form (see
  [rugby.md](rugby.md#the-match-view)).
- **Players**: every contributor of the two teams (goals, assists, and in rugby
  points), unioned across the three boards the endpoint returns.

## Live refresh

The WS patches only the score and status. While the match is in play the page
polls every 45 s: insights, live detail, the ranking (if open) and the
play-by-play (if ever opened). The server caches keep that cheap: live detail and
timeline 60 s in memory, frozen for the process lifetime once finished (the
in-memory maps assume a single instance, see
[../decisions.md](../decisions.md)).

## Where the data comes from

- **Provider adapters.** `getMatchDetail`, `getMatchTimeline`, `getMatchLineups`
  and `getMatchStats` are optional methods on the provider contract
  (`server/utils/providers/types.ts`), implemented by the FIFA, UEFA, ESPN and
  World Rugby adapters; football-data and the offline fixture provider carry
  none, so their sections stay empty. Per-feed quirks (ESPN's single summary
  document, FIFA's `ifesId` stats, UEFA's lineups endpoint) are in
  [../architecture/providers.md](../architecture/providers.md).
- **Finalize-time detail sync.** `syncMatchDetails`
  (`server/utils/sync/details.ts`), run per competition by the every-minute
  `matches:finalize` task, pulls `getMatchDetail` for up to 20 `FINISHED` matches
  with no `detailsFetchedAt` (and a `providerStageId`), replaces their
  `goal_event` rows (never replacing stored goals with an empty list) and stores
  `possessionHome/Away`. That persisted copy is what insights, the Players tab,
  the scorer boards and the Golden Boot read; during a live match the page leans
  on the live detail instead. Finalize itself is in
  [predictions-and-scoring.md](predictions-and-scoring.md#finalizing).
- **Live score.** `scores:poll` (cron `*/30 * * * * *`, gated on a live window)
  runs `syncLive` per competition and publishes `match:update` frames. See
  [../architecture/realtime.md](../architecture/realtime.md).

## Line-ups

`server/utils/lineups/service.ts` makes the `match_lineups` row the cache:
served within a 60 s TTL while pending or live, forever once `final`. On a miss
the route fetches the provider line-up (the source of truth for who plays) and
`storeLineups` refines positions when a starter lacks coordinates and the match
has a Sofascore odds anchor (`oddsProvider = 'sofascore'`, `oddsEventRef`, see
[odds.md](odds.md)): `fetchSofascoreLineups` + `deriveSofascorePositions` map
coordinates by shirt number, flipping sides on `oddsEventSwapped`. Only a
**confirmed** Sofascore XI is applied. A row freezes only when the match is
`FINISHED`, available and resolved, so a failed refine keeps retrying instead of
freezing on the band fallback. Client side `useMatchLineups` polls every 60 s
until the XI is in and the match is over.

## Mobile

`apps/mobile-flutter/app/lib/ui/match/match_detail_screen.dart` reads the same
routes (`api/matches_api.dart`) as a scrollable tab bar: pick (prediction editor,
crowd consensus, reactions, past picks), timeline, line-ups, scorers, insights,
live detail, leaderboard and media (`ui/match/tabs/`). Differences from the web:
line-ups are a plain XI list with formation, shirt and captain (no pitch); the
header shows the stored score (no feed-led live score or celebration), refreshed
when a `match:update` frame invalidates `matchProvider` (`ui/home_shell.dart`);
the viewer count sits in the app bar. Status per tab is in
`apps/mobile-flutter/PARITY.md`; the app itself in [mobile-app.md](mobile-app.md).

## History

Match details and live WS scores 0.3.0; stat rows, laced timeline and in-place
pick 0.4.0; tab in the URL and Euro stats 0.7.1; all-time head-to-head and the
goal celebration 0.8.0; live clock and live stats 1.2.0; play-by-play tab 1.3.0
(UEFA 1.14.0, localized 1.9.0); per-match league tab 1.12.0, renamed Ranking and
opened to everyone 1.24.0; watch links 1.19.0, as tabs 1.26.0; line-ups 1.31.0,
on a real pitch with Sofascore refinement and persisted 1.31.3; viewer count
2.5.0; feed-led live header 2.33.1; rugby detail 5.0.0, football-only
head-to-head/form 5.0.1.

## Sources

- `apps/web-nuxt/app/pages/[competition]/matches/[id].vue`
- `apps/web-nuxt/app/components/match/PlayByPlay.vue`, `MatchLineups.vue`,
  `PitchHalf.vue`, `LineupPlayer.vue`, `GoalAnimation.vue`, `MatchViewers.vue`,
  `ReactionBar.vue`, `MatchMedia.vue`, `MatchMediaEmbed.vue`, `MatchOdds.vue`,
  `PastPickHint.vue`, `SharePickButton.vue`, `CrowdLine.vue` (under
  `apps/web-nuxt/app/components/`)
- `apps/web-nuxt/app/utils/match-view.ts`, `live-score.ts`, `lineup.ts`
- `apps/web-nuxt/app/composables/useLiveMatch.ts`, `useMatchLineups.ts`,
  `useMatchPresence.ts`, `useMatchMedia.ts`
- `apps/web-nuxt/server/api/matches/[id].get.ts`, `apps/web-nuxt/server/api/matches/[id]/*.get.ts`
- `apps/web-nuxt/server/utils/lineups/` (`service.ts`, `sofascore-lineups.ts`,
  `sofascore-positions.ts`)
- `apps/web-nuxt/server/utils/stats/insights.ts`, `alltime-h2h.ts`, `scorers.ts`
- `apps/web-nuxt/server/utils/sync/details.ts`, `apps/web-nuxt/server/tasks/matches/finalize.ts`,
  `apps/web-nuxt/server/tasks/scores/poll.ts`, `apps/web-nuxt/server/utils/tasks/registry.ts`
- `apps/web-nuxt/server/utils/providers/types.ts` (the optional detail methods)
- `apps/mobile-flutter/app/lib/ui/match/`, `apps/mobile-flutter/app/lib/api/matches_api.dart`
