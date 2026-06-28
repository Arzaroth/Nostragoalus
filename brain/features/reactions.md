# Match reactions

Lightweight emoji reactions on a match, shared live among viewers. The same
reaction set is reused for chat message reactions.

## Model

- A reaction is a `match_reaction` row keyed by `(userId, matchId)` with an
  `emoji`. One reaction per user per match.
- The public palette is six reactions: `FIRE`, `GOAL`, `WOW`, `LAUGH`, `SAD`,
  `ANGRY`, rendered as the emoji set (fire, ball, wow, laugh, sad, angry).
- Rendered by `ReactionBar.vue` via the `ReactionGlyph` component.
- Live updates flow through `publishLeagueReactionUpdate` on the hub (see
  [../architecture/realtime.md](../architecture/realtime.md)).

## Reused by chat

[Chat](chat.md) message reactions reuse this same six-emoji set. Chat reactions
are stored as plaintext emoji (the server sees the emoji even though message
content is end-to-end encrypted), modelled the same way as match reactions.

## Secret cosmetic tie-in

When a [My Little Prono skin](easter-eggs.md) is active, `ReactionBar` swaps the
six emoji for the mane-six pony heads, using a fixed mapping independent of which
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

- `db/app-schema.ts` (`match_reaction`, `reaction_emoji` enum)
- `shared/reactions.ts`
- `app/components/ReactionBar.vue`, `app/components/ReactionGlyph.vue`
- `server/utils/live/hub.ts` (`publishLeagueReactionUpdate`)
