# Bookmaker odds

Match odds power the optional odds scoring bonus and a small odds display on the
match view. Odds are 1X2 (home / draw / away) in decimal format only - no US
moneyline, by deliberate choice.

## Providers

- **Sofascore** (primary): an unofficial JSON API, chosen over The Odds API
  because it is free, keyless, and serves retroactive history (so past
  tournaments can be backfilled). It needs a browser User-Agent and the calls
  are spaced to avoid the Cloudflare WAF. Verified ids: `uniqueTournament 16` =
  World Cup (season `58210` for 2026, `41087` for 2022), `uniqueTournament 1` =
  Euro. The full request chain is in
  [../architecture/providers.md](../architecture/providers.md).
- **BetExplorer** (backup): plain server-rendered HTML, used for bookmaker
  averages and as a fallback.

Sofascore is a single feed, so median/consensus across books does not apply to
it; BetExplorer supplies cross-book averages.

## Storage and refresh

- `odds_snapshot` rows store a snapshot per match: `provider`, `eventRef`, the
  `OddsTriple` (`oddsHome`/`oddsDraw`/`oddsAway`), and a `kind` of `POLL` (live
  polling) or `BACKFILL` (historical import).
- The `odds:refresh` task runs every 30 minutes, fire-and-forget.

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

- `server/utils/odds/providers/sofascore.ts`, `server/utils/odds/providers/betexplorer.ts`
- `server/utils/odds/service.ts`
- `shared/types/odds.ts` (`OddsTriple`, `StoredBookmakerOdds`)
- `db/app-schema.ts` (`odds_snapshot`, `odds_kind` enum)
- `server/utils/providers/cycle-tls.ts`
