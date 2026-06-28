# Crowd / consensus bot

A synthetic "ghost" participant that plays the consensus of the whole crowd. It
appears on the scoreboard and predictions views so users can see, and beat, the
wisdom of the crowd.

## Identity

The bot is a sentinel user, `BOT_USER_ID = '__bot__'`. It is not a real account;
its predictions are derived on the fly from everyone else's.

## Consensus methods

Two methods, switchable in the UI:

- **MODE** - the most-picked scoreline. This is the default.
- **MEAN** - the rounded average of all predicted scores.

MODE is greyed out below 5 distinct predictors (with a "biased data" tooltip),
and the server forces MEAN below that gate regardless of the client, so a thin
sample cannot produce a misleadingly confident mode.

## How the bot is scored

The bot is scored by the real engine, so its row is directly comparable to human
players:

- Its joker is the crowd-majority pick per knockout round.
- Its champion is the most-picked team (see [champion-pick.md](champion-pick.md)).
- Bonuses are computed against the **global locked histogram**, the same
  denominator real users were scored against. League scoping never shrinks the
  bonus denominator.

## Display rules

- The ghost row is display-only at its would-be rank. On an exact points tie,
  real users win; the bot sorts below them.
- Users see the consensus only for matches that have kicked off. Admins also see
  it for upcoming matches (server-enforced, so the pre-kickoff crowd is not
  leaked to regular users).

## League scoping

`getCrowdTotals(db, ..., leagueId?)` sums predictions per match and returns
`{matchId: {home, away, count}}`. With a `leagueId` it sums only that league's
members, but this is display-only: the scoring crowd bonus is always global (see
[leagues.md](leagues.md)). `upsertPrediction` triggers `publishCrowdUpdate` so
the consensus moves live for subscribers (see
[../architecture/realtime.md](../architecture/realtime.md)).

## Sources

- `shared/types/bot.ts` (`BOT_USER_ID`)
- `server/api/predictions/crowd.get.ts`
- `server/utils/predictions/service.ts` (`getCrowdTotals`, `publishCrowdUpdate`)
- `app/utils/crowd-patch.ts`, `app/composables/useCrowdTotals.ts`
