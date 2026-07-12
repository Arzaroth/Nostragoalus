# Head-to-head

A one-on-one comparison of two players over the matches they have **both** had
scored in a competition. Where [personal analytics](analytics.md) reports on one
player, head-to-head puts two side by side. Like analytics it is not gated on the
final: it reads whatever shared scored picks exist so far, so it works
mid-tournament.

Not to be confused with [`apps/web-nuxt/server/utils/stats/alltime-h2h.ts`](../../apps/web-nuxt/server/utils/stats/alltime-h2h.ts),
which is the all-time record between two national **teams** (FIFA archive) shown
in match insights. This is player vs player on their predictions.

## What it shows

- **Header**: both players (avatar, name) with their total points over the shared
  matches; the trailing player is dimmed.
- **Summary**: shared-pick count; the match record (wins-losses-ties, decided by
  who scored more points on each shared match); same-score and same-outcome
  agreement counts.
- **Lead over time**: a two-series sparkline of cumulative points per round (player
  A a solid line, player B a dashed line so the two are told apart by shape as well
  as colour), with a per-round hover band.
- **Biggest divergences**: up to six shared matches where the two picked different
  outcomes, largest points gap first (matchId breaks a tie so the set is stable),
  each showing both predictions, the actual score, and who took the points.

## How it works

- [`apps/web-nuxt/server/utils/analytics/h2h.ts`](../../apps/web-nuxt/server/utils/analytics/h2h.ts) -
  `getHeadToHead(db, { competitionId, aId, bId, viewerId, isAdmin })` loads both
  players and their scored picks and hands the shared rows to the pure
  `computeHeadToHead(competitionName, a, b, rows)`, so all aggregation is
  unit-tested without a database. The load aliases `prediction` twice
  (`aliasedTable`) and inner-joins B's row on the same match, keeping only rows
  where **both** picks are scored and the match has a final score
  (`totalPoints`/`fullTimeHome`/`fullTimeAway` all not null); a scored 0-point pick
  counts as present. Rows come ordered by `(kickoffTime, match.id)`. Outcome
  derivation reuses `outcomeOf` from [`scoring/tiers.ts`](../../apps/web-nuxt/server/utils/scoring/tiers.ts).
- **Privacy**: `getHeadToHead` enforces `canViewProfile`
  ([`leagues/service.ts`](../../apps/web-nuxt/server/utils/leagues/service.ts)) for **both**
  players unconditionally, and an unknown player and a private-unviewable one both
  raise `NotFoundError('user not found')`, so a private account is never
  distinguishable from a missing one. Admins see through it. Only scored picks are
  ever exposed, so nothing pending leaks.
- Route [`apps/web-nuxt/server/api/head-to-head.get.ts`](../../apps/web-nuxt/server/api/head-to-head.get.ts) -
  a GET taking `a`, `b` (either may be `'me'`, resolved to the signed-in viewer)
  and optional `competition`. Missing or identical ids are a 400; the
  `getHeadToHead` call is wrapped in `toHttpError` so `NotFoundError` maps to 404.
- DTO in [`#shared/types/h2h`](../../apps/web-nuxt/shared/types/h2h.ts).
- Client: [`apps/web-nuxt/app/composables/useHeadToHead.ts`](../../apps/web-nuxt/app/composables/useHeadToHead.ts)
  (vue-query, key `['head-to-head', slug, a, b]`, disabled until both ids differ)
  -> [`apps/web-nuxt/app/pages/[competition]/compare.vue`](../../apps/web-nuxt/app/pages/%5Bcompetition%5D/compare.vue)
  (reads `?a=&b=`, empty/error states) -> presentational
  [`apps/web-nuxt/app/components/H2HReport.vue`](../../apps/web-nuxt/app/components/H2HReport.vue). The lead
  chart uses the shared [`apps/web-nuxt/app/utils/sparkline.ts`](../../apps/web-nuxt/app/utils/sparkline.ts)
  geometry helpers.
- Entry: a "Compare" button on a player's profile
  ([`users/[id].vue`](../../apps/web-nuxt/app/pages/%5Bcompetition%5D/users/%5Bid%5D.vue)),
  shown to signed-in viewers on someone else's profile in competition scope, links
  to `/<competition>/compare?a=me&b=<their-id>`.

## Notes

- Competition-scoped only: jokers and the champion pick are per-competition, so a
  cross-competition comparison would not be meaningful.
- Not league-scoped: it compares the two players' base picks across the
  competition.
- i18n lives under the `h2h.*` namespace in all five locales.

## Sources

- [`apps/web-nuxt/server/utils/analytics/h2h.ts`](../../apps/web-nuxt/server/utils/analytics/h2h.ts)
- [`apps/web-nuxt/server/api/head-to-head.get.ts`](../../apps/web-nuxt/server/api/head-to-head.get.ts)
- [`apps/web-nuxt/shared/types/h2h.ts`](../../apps/web-nuxt/shared/types/h2h.ts)
- [`apps/web-nuxt/app/composables/useHeadToHead.ts`](../../apps/web-nuxt/app/composables/useHeadToHead.ts)
- [`apps/web-nuxt/app/pages/[competition]/compare.vue`](../../apps/web-nuxt/app/pages/%5Bcompetition%5D/compare.vue)
- [`apps/web-nuxt/app/components/H2HReport.vue`](../../apps/web-nuxt/app/components/H2HReport.vue)
- [`apps/web-nuxt/app/utils/sparkline.ts`](../../apps/web-nuxt/app/utils/sparkline.ts)
