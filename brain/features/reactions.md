# Match reactions

Lightweight emoji reactions on a match, shared live among viewers. The same
reaction set is reused for chat message reactions.

## Model

- A reaction is a `match_reaction` row keyed by `(userId, matchId)` with an
  `emoji`. One reaction per user per match, changeable; `emoji: null` clears it
  (toggle off). Reactions open at kickoff and stay open after full-time: a
  pre-kickoff write is rejected (`setReaction` in
  `apps/web-nuxt/server/utils/reactions/service.ts`).
- The public palette is six reactions: `FIRE`, `GOAL`, `WOW`, `LAUGH`, `SAD`,
  `ANGRY`, rendered as the emoji set (fire, ball, wow, laugh, sad, angry).
- Rendered by `ReactionBar.vue` (the interactive bar on the match page and the
  focused [multiview](multiview.md) cell, `useMatchReactions`) and, read-only, by
  `MatchReactionsLine.vue` on each fixtures-list card (`useCompetitionReactions`),
  both via the `ReactionGlyph` component. Each shows the selected league's counts
  when a league is picked, else the global ones.
- Reads: `GET /api/reactions/[matchId]` (one match) and `GET /api/reactions`
  (bulk, a whole competition keyed by match id, so the list fetches once). Global
  counts are public (read-only aggregates, guests see the bar without a "mine");
  `?league=` counts are members-only, like crowd totals.
- A write (`/api/reactions` PUT) publishes the global bar total
  (`publishReactionUpdate`, frame `reaction:update`) and, fire-and-forget,
  per-league totals (`publishLeagueReactionUpdates`, frame
  `reaction:league-update`); the hub fans them out to subscribers (see
  [../architecture/realtime.md](../architecture/realtime.md)).

## Reused by chat

[Chat](chat.md) message reactions reuse this same six-emoji set (the same
`reaction_emoji` enum). Chat reactions are stored as plaintext emoji in
`chat_message_reaction` (the server sees the emoji even though message content is
end-to-end encrypted), modelled the same way as match reactions: one per user per
message, pushed live as `chat:reaction` / `dm:reaction`.

## Secret cosmetic tie-in

When a [My Little Prono skin](easter-eggs.md) is active, `ReactionGlyph` (which
the match `ReactionBar` and chat reactions both render through) swaps the six
emoji for the mane-six pony heads, using a fixed mapping independent of which
skin is selected:

| Reaction | Pony |
|---|---|
| FIRE | Rainbow Dash |
| GOAL | Applejack |
| WOW | Twilight |
| LAUGH | Pinkie Pie |
| SAD | Fluttershy |
| ANGRY | Rarity |

The swap is display-only: the stored reaction enum key is unchanged. The public,
documented palette is the emoji set; the pony heads are an easter egg (see
[easter-eggs.md](easter-eggs.md)).

## Sources

- `apps/web-nuxt/db/app-schema.ts` (`match_reaction`, `chat_message_reaction`, `reaction_emoji` enum)
- `apps/web-nuxt/shared/reactions.ts`
- `apps/web-nuxt/app/components/{ReactionBar,MatchReactionsLine,ReactionGlyph}.vue`,
  `apps/web-nuxt/app/composables/{useMatchReactions,useCompetitionReactions}.ts`
- `apps/web-nuxt/server/utils/reactions/service.ts`,
  `apps/web-nuxt/server/api/reactions/{index.put,index.get,[matchId].get}.ts`
- `apps/web-nuxt/server/utils/live/hub.ts` (`publishReactionUpdate`, `publishLeagueReactionUpdate`),
  `apps/web-nuxt/server/utils/live/league-reactions.ts` (`publishLeagueReactionUpdates`)
