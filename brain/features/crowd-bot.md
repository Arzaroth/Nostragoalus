# Prediction bots (personas)

Synthetic "ghost" participants that play a strategy scored by the real engine.
They appear on the leaderboard and a per-bot predictions page so users can see,
and beat, them. Three personas ship today; all are computed on the fly, none is
stored. Two are crowd-derived (`CONSENSUS`, `EQUALIZER`); one is **per-user**
(`EVIL_TWIN`).

## Personas

Each persona is a picking strategy scored by the real engine. See
`server/utils/bot/service.ts` (`botPick`, `getBotOverview`, `getBotChampion`).

| Persona | icon | Per-match pick | Joker (per KO round) | Champion |
| --- | --- | --- | --- | --- |
| `CONSENSUS` | 🤖 | the crowd's MODE/MEAN scoreline | where **most** of the crowd jokered | most-picked team |
| `EVIL_TWIN` | 😈 | **per-user**: the signed-in player's own picks with each score **swapped** (winner flipped, margin kept; a draw is its own twin) | the same match the **player** jokered | the **player's own** champion (kept, not inverted) |
| `EQUALIZER` | ⚖️ | always a **1-1 draw** (`DRAW_SCORELINE`), ignoring the crowd scoreline and the MODE gate | the **most drawish** match (smallest crowd margin) | none (a draw-caller has no champion) |

The evil twin is computed by scoping `getBotOverview` to a single `userId` (the
signed-in viewer): `scoped` is just that player's own predictions, so
`botPick` inverts each of their picks, the joker logic finds only their jokered
match as a candidate, and `getBotChampion` returns their own pick. Without a
viewer it returns empty - it never falls back to inverting the whole crowd.

`consensusCount/Total` on a row is re-derived as how many of the crowd landed on
exactly the persona's pick (the "picked by X/Y" badge). The consensus reports
its method (MODE/MEAN), the equalizer reports `MODE`-style so the badge shows
that draw count; the per-user evil twin has no crowd context, so its counts are
0 and the badge is hidden.

## Identity

Each persona is a distinct sentinel user id (`botUserId(persona)`), so all
three can share one board without colliding on the render key. `CONSENSUS`
keeps the original `BOT_USER_ID = '__bot__'` so old deep links still resolve.
The wire/deep-link param is lowercase-hyphenated (`consensus`, `evil-twin`,
`equalizer`); `parseBotPersona` falls back to consensus for anything unknown.

## Consensus methods

Two methods, switchable in the UI, shaping the `CONSENSUS` pick only (the evil
twin swaps your literal picks and the equalizer always draws, so neither shows
the method toggle - `personaUsesMethod`):

- **MODE** - the most-picked scoreline. The default.
- **MEAN** - the rounded average of all predicted scores.

MODE is greyed out below 5 distinct predictors (`MIN_CONSENSUS_USERS`, "biased
data" tooltip), and the server forces MEAN below that gate regardless of the
client, so a thin sample cannot produce a misleadingly confident mode.

## How a bot is scored

Scored by the real engine, so each row is directly comparable to human players:

- Bonuses are computed against the **global locked histogram**, the same
  denominator real users were scored against. League scoping never shrinks the
  bonus denominator.
- The champion bonus (see [champion-pick.md](champion-pick.md)) is awarded once
  the final is decided, paying the modal snapshot the persona's crowd locked in.

## Display rules

- Each enabled persona is an independent, display-only ghost row at its
  would-be rank (`insertGhostRows`). On an exact points tie, real users win;
  the bot sorts below them.
- The leaderboard offers one toggle per persona; the ghost hides in the global
  view (jokers, finals and champion picks are competition-scoped). The evil-twin
  toggle only appears to a signed-in viewer (it swaps their own picks). Each row
  deep-links to `/{competition}/bot?persona=...`; the evil twin's row reads
  "Your Evil Twin".
- Users see picks only for matches that have kicked off. Admins also see
  upcoming ones (server-enforced, so the pre-kickoff crowd is not leaked).

## Live crowd totals (adjacent feature)

`getCrowdTotals(db, ..., leagueId?)` sums predictions per match and returns
`{matchId: {home, away, count}}`. With a `leagueId` it sums only that league's
members, but this is display-only: the scoring crowd bonus is always global (see
[leagues.md](leagues.md)). `upsertPrediction` triggers `publishCrowdUpdate` so
the totals move live for subscribers (see
[../architecture/realtime.md](../architecture/realtime.md)). This powers the
score-input crowd line, not the bots' own consensus.

## Sources

- `shared/types/bot.ts` (`BotPersona`, `botUserId`, `parseBotPersona`,
  `DRAW_SCORELINE`, `BOT_PERSONA_META`, `personaUsesMethod`)
- `server/utils/bot/service.ts` (`botPick`, `computeConsensus`, `getBotOverview`,
  `getBotChampion`, TTL cache keyed by persona)
- `server/api/bot/predictions.get.ts`, `server/api/bot/leaderboard-row.get.ts`
  (both take a `persona` query param)
- `app/composables/useBot.ts` (`useBotPersonas`, `useBotRow`, `useBotPredictions`)
- `app/utils/bot-row.ts` (`insertGhostRow`, `insertGhostRows`)
- `app/pages/[competition]/leaderboard.vue`, `app/pages/[competition]/bot.vue`
- Live crowd totals: `server/utils/predictions/service.ts`
  (`getCrowdTotals`, `publishCrowdUpdate`), `app/composables/useCrowdTotals.ts`
