# Bookmaker odds

Match odds power the optional odds scoring bonus and a small odds display on the
match view (fixture list, match detail, and prediction rows). Odds are 1X2
(home / draw / away) in decimal format only - no fractional or US moneyline, by
deliberate choice. The display also shows opening-vs-current line movement and,
on tap, the per-bookmaker breakdown - see [Display](#display).

## Providers

- **Sofascore** (primary): an unofficial JSON API, chosen over The Odds API
  because it is free, keyless, and serves retroactive history (so past
  tournaments can be backfilled). It needs a browser User-Agent and the calls
  are spaced to avoid the Cloudflare WAF. Verified ids: `uniqueTournament 16` =
  World Cup (season `58210` for 2026, `41087` for 2022), `uniqueTournament 1` =
  Euro. The full request chain is in
  [../architecture/providers.md](../architecture/providers.md).
- **BetExplorer**: a selectable provider (`ODDS_PROVIDERS` in
  `provider-config.ts`) but `fetchesOdds: false` - it renders its 1X2
  client-side only, with no plain-HTTP odds endpoint, so picking it lists
  fixtures yet never prices them without a headless browser. No fetcher ships
  for it today.

Sofascore is a single aggregated feed, so a per-bookmaker breakdown does not
apply to it - its snapshots store `bookmakers: null`. The `bookmakers` column
exists for a future multi-book provider; the display surfaces it when populated.

## Storage and refresh

- `odds_snapshot` rows store a snapshot per match: `provider`, `providerEventRef`,
  the current `OddsTriple` (`oddsHome`/`oddsDraw`/`oddsAway`), the opening prices
  (`initialHome`/`initialDraw`/`initialAway`, null when the provider exposes no
  open), a `bookmakers` jsonb (`StoredBookmakerOdds[]`, null for aggregating
  feeds like Sofascore), and a `kind` of `POLL` (live polling) or `BACKFILL`
  (historical import).
- The `odds:refresh` task runs every 30 minutes, fire-and-forget.
- `latestOddsByMatch` (`apps/web-nuxt/server/utils/odds/store.ts`) reads the newest snapshot
  per match and surfaces current + opening + bookmakers as `MatchOddsView`; the
  match list/detail services attach it as `match.odds`.

## Display

The compact `MatchOdds.vue` renders the current 1X2 plus a movement marker per
outcome:

- `oddsMovement(initial, current)` (`apps/web-nuxt/app/utils/odds-movement.ts`) is a pure
  helper returning per-outcome `{ direction, delta }` where direction is `in`
  (shortened: current < opening), `out` (drifted: current > opening) or `flat`.
  The drift is rounded to the two decimals shown, so the marker never
  contradicts the number; a missing opening price yields all-`flat`,
  `hasInitial: false`.
- Tapping the row expands the opening prices and the per-bookmaker 1X2 (only
  when present - Sofascore stores no `bookmakers`, so that block is empty until a
  multi-book provider populates it).
- `useMatchOdds.ts` carries the full `MatchOddsView` to prediction rows (it no
  longer flattens to a bare triple).

## Scoring

Odds feed the optional odds bonus in the scoring engine, applied only when
`oddsAppliesTo` is configured in `scoring_config`. See
[predictions-and-scoring.md](predictions-and-scoring.md). Odds are optional to the
game: the crowd-rarity bonus works without them.

## HTTP

Both providers are fetched through the shared cycletls (uTLS) engine so a browser
JA3 fingerprint gets past the Cloudflare-class WAF. See
[../architecture/providers.md](../architecture/providers.md).

## Sources

- `apps/web-nuxt/server/utils/odds/providers/sofascore.ts` (the only plain-HTTP fetcher today)
- `apps/web-nuxt/server/utils/odds/store.ts` (`latestOddsByMatch`, `MatchOddsView`), `sync.ts`, `provider-config.ts`, `matcher.ts`
- `apps/web-nuxt/server/utils/matches/service.ts` (attaches `match.odds`)
- `apps/web-nuxt/app/utils/odds-movement.ts`, `apps/web-nuxt/app/composables/useMatchOdds.ts`, `apps/web-nuxt/app/components/MatchOdds.vue`
- `apps/web-nuxt/shared/types/odds.ts` (`OddsTriple`, `StoredBookmakerOdds`, `OddsSnapshotKind`)
- `apps/web-nuxt/db/app-schema.ts` (`odds_snapshot`; `kind` is an inline `POLL`/`BACKFILL` text
  column typed `OddsSnapshotKind`, not a separate pg enum)
- `apps/web-nuxt/server/utils/providers/cycle-tls.ts`
