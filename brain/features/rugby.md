# Rugby (multi-sport)

The app is no longer football-only. A competition names the sport it is played
at, and that one field decides where its fixtures come from, how a prediction is
scored, which ranking table prices a champion pick, and what the header mark
looks like. Everything else - leagues, chat, achievements, the bracket, the
crowd bonus - is sport-agnostic and untouched.

Rugby union is the first non-football sport. Nothing is football-specific by
accident any more, but nothing is over-generalized either: a second sport is a
row in a lookup, not a plugin system.

## What a competition carries

`competition.sport` is the `sport` pg enum (`FOOTBALL` | `RUGBY_UNION`). It is
**looked up from the provider** at creation (`sportForProvider` in
[../../apps/web-nuxt/shared/sport.ts](../../apps/web-nuxt/shared/sport.ts)), never
posted by the client - a provider serves exactly one sport, so accepting it from
a form only creates a way to get it wrong.

`competition.providerSport` is the provider's **sub-feed**, where it has several.
Only World Rugby does: men's and women's union, the age-grade grades, and
sevens, each a separate catalog and a separate ranking table. Football providers
leave it null. The two fields are different vocabularies (`RUGBY_UNION` vs
`mru`) and used to share a field name at the provider chokepoint, which quietly
handed the adapter the wrong one - see
[../decisions.md](../decisions.md).

## Where the data comes from

World Rugby's own feed, not ESPN's rugby coverage. The adapter, its endpoints
and the traps in each are documented in
[../architecture/providers.md](../architecture/providers.md).

It reaches full parity with the football adapters: discovery, fixtures, bracket,
match detail, play-by-play, per-match team stats, tournament squads and team
sheets. The only thing the shared shapes cannot hold is a rugby **position** -
`SquadPlayer.position` is `GK | DF | MF | FW`, and a hooker is none of them.

## How a rugby prediction is scored

The football tiers degenerate in rugby: nobody calls 27-24 on judgement, so
`EXACT` collapses into luck and an exact-margin `DIFF` is barely easier. The
preset in
[../../apps/web-nuxt/server/utils/scoring/config.ts](../../apps/web-nuxt/server/utils/scoring/config.ts)
changes three things, each forced by the shape of a rugby scoreline rather than
by taste:

- **`DIFF` counts margin bands**, not exact margins. `scoringConfig.marginBands`
  holds the upper bounds; rugby ships `[7, 14]`, so 1-7 (one converted try),
  8-14 and 15+ each count as one band. Null is football, where every margin is
  its own band and the tier reduces to exact goal difference - which is why the
  football path is byte-identical, proved by the frozen parity vectors
  re-blessing with zero deletions.
- **`EXACT` stops being the headline** (5 points, with `DIFF` at 3). It pays like
  a lottery line; `DIFF` is where reading the game shows.
- **The crowd bonus moves to `OUTCOME` basis.** On `EXACT` basis the rarity share
  is `exactCount / outcomeCount`, and rugby scorelines are nearly all unique - so
  the share is tiny for everyone and the top tier would pay out to the whole
  field, a flat top-up that discriminates nothing.

The preset is applied as an ordinary, editable per-competition override the
moment a non-football competition is created
([../../apps/web-nuxt/server/utils/competitions/service.ts](../../apps/web-nuxt/server/utils/competitions/service.ts)).
It is seeded so the competition does not open in a state nobody wants, not to be
a rule an admin cannot move.

Margin bands are carried by every scorer, not just the main engine: the league
mode re-score path takes them through `ModeScoreContext`, because a league board
and the global ladder disagreeing on the same pick reads as a data bug.

## Champion picks

Rugby reads World Rugby's table, football reads FIFA's, chosen per competition by
`getRanksForCompetition`
([../../apps/web-nuxt/server/utils/champion/ranking.ts](../../apps/web-nuxt/server/utils/champion/ranking.ts)).
The cache is keyed per source: the men's and women's tables are different lists
under codes of the same three-letter shape, so one shared slot would serve the
wrong sport for a full TTL with nothing to show it.

Rugby's tiers are tighter at the top than football's (4 / 10 / 20 rather than
8 / 20 / 40) because rugby's leading places barely move year to year - a top-4
pick is close to no call at all.

`champion:backfill-ranks` is football-only, and says so: the three-letter codes
collide across the two tables (NZL, RSA, FRA and ARG are in both), so a rugby
pick would be rewritten with a football rank and then leave the null-rank set,
out of reach of a re-run.

## Two scorer boards

In rugby the leading try scorer and the leading points scorer are usually
different people, and only one of them is a kicker - so one board cannot say
both. `goal_event.points` records what a play was worth (null for football,
where every goal is one). Rugby stores a row per scoring event, so the try board
counts the rows worth at least a try and the points board sums them. See
[stats.md](stats.md).

The Stats view picks its boards from the competition's sport, not from whether
points data happens to have arrived - inferring it from the payload showed
football headings until the first score landed, then flipped mid-tournament.

## The mark

A rugby competition puts a rugby ball inside the crystal ball
(`LogoRugby.vue`). An unlocked skin still wins over the sport: that is something
the user went looking for, and which tournament they happen to be viewing should
not undo it. The sport rides on the competition meta already resolved during
SSR, so the right mark is in the first paint.

Only the in-app header switches. The static emblem on the login, about and
share-card surfaces is still the football one - see `TODO.md`.

## The match view

Two different renderers show a match's events, and both had to learn the sport:

- The **timeline column** on the match page is built client-side by
  `buildTimeline` from the live detail's goals, bookings and substitutions. Its
  score glyph comes from `scoreIcon(points)` - a rugby ball for a try, the posts
  for a kick, a football when there are no points (`NormalizedGoal.points` has
  to survive the response schema for this to work; omitting it there stripped it
  on the way out and drew a football beside a conversion).
- The **Play-by-play tab** is the provider's own timeline, where each rugby play
  carries its own `TimelineEventKind` (`try`, `conversion`, `conversion-missed`,
  `penalty-kick`, `drop-goal`). A conversion is a second player's play seconds
  after the try; folding it into the try loses it, and calling all three "goal"
  is how the football kinds read a rugby match.

**Head-to-head and Form are football-only.** They read FIFA's archive of senior
men's international football, and the three-letter country codes are shared
across sports - so a rugby France-South Africa tie was illustrated with their
football meetings until the endpoint learned to check
`competition.sport`.

## What rugby deliberately does not have

- **Assists.** The feed has no assist concept, so that board is replaced rather
  than left empty.
- **Fergie time.** The analytic fires only on a minute containing `+`, which the
  World Rugby clock never produces, so it is inert for rugby rather than wrong -
  a try-only reconstruction of a 27-13 scoreline would be nonsense.
- **Positions**, per above.

## Sources

- [../../apps/web-nuxt/shared/sport.ts](../../apps/web-nuxt/shared/sport.ts) (sport enum mirror, per-provider sub-feeds, `sportForProvider`)
- [../../apps/web-nuxt/server/utils/providers/worldrugby.ts](../../apps/web-nuxt/server/utils/providers/worldrugby.ts), [worldrugby-ranking.ts](../../apps/web-nuxt/server/utils/providers/worldrugby-ranking.ts)
- [../../apps/web-nuxt/server/utils/scoring/tiers.ts](../../apps/web-nuxt/server/utils/scoring/tiers.ts) (`marginBandOf`, `classifyTier`), [config.ts](../../apps/web-nuxt/server/utils/scoring/config.ts) (`rulesForSport`, `RUGBY_UNION_RULES`)
- [../../apps/web-nuxt/server/utils/champion/ranking.ts](../../apps/web-nuxt/server/utils/champion/ranking.ts) (per-sport ranking source)
- [../../apps/web-nuxt/server/utils/stats/scorers.ts](../../apps/web-nuxt/server/utils/stats/scorers.ts) (`TRY_POINTS`, the points board)
- [../../apps/web-nuxt/app/components/LogoMark.vue](../../apps/web-nuxt/app/components/LogoMark.vue), [logos/LogoRugby.vue](../../apps/web-nuxt/app/components/logos/LogoRugby.vue)
- [../../apps/web-nuxt/tests/e2e/rugby.e2e.ts](../../apps/web-nuxt/tests/e2e/rugby.e2e.ts)
