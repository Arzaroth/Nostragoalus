# Features

The product catalogue. Each row links to a detailed doc. "Shipped" is the
release where the feature reached production (blank = part of the core since
early on). Back to the root map: [../BRAIN.md](../BRAIN.md).

| Feature | What it is | Shipped | Key tables / files |
|---|---|---|---|
| [Competitions](competitions.md) | Multi-tournament model + `/[competition]/` URL routing and switcher | core | `competition`, `round`, `match`; `useCompetitions.ts`, `CompetitionPill.vue` |
| [Predictions & scoring](predictions-and-scoring.md) | The core loop: predict scores, lock at kickoff, earn tiered points + bonuses | core | `prediction`, `match_score_event`, `scoring_config`; `server/utils/scoring/*` |
| [Pick guard](pick-guard.md) | Outstanding-picks nudge + jump-to-first, and an outlandish-score confirm before auto-save | unreleased | `app/utils/outstanding-picks.ts`, `app/utils/prediction-sanity.ts`, `ScoreInput.vue` |
| [Champion pick](champion-pick.md) | Per-competition winner pick, FIFA-rank tier points snapshotted at pick time | core | `champion_pick`; `server/utils/champion/*` |
| [Best scorer](best-scorer.md) | Golden Boot pick from team squads, goal-event-derived award | core | `best_scorer_pick`; `server/utils/bestscorer/*` |
| [Stats](stats.md) | Player rankings tab in the matches view: top scorers + top assists, side by side | 2.2.0 | `useScorers.ts`, `PlayerRankingTable.vue`, `competitions/scorers.get.ts` |
| [Leagues](leagues.md) | Competition-scoped player groups, roles, public/private, SSO auto-join | core | `league`, `league_member`, `league_opt_out`, `league_leaderboard_rank` |
| [Crowd bot](crowd-bot.md) | Synthetic consensus participant (MODE/MEAN) on the scoreboard | core | `'__bot__'`; `server/utils/scoring/*`, `predictions/crowd.get.ts` |
| [Odds](odds.md) | Decimal 1X2 bookmaker odds (Sofascore primary, BetExplorer backup) | core | `odds_snapshot`; `server/utils/odds/*` |
| [Reactions](reactions.md) | Six-emoji match reactions, reused by chat | core | `match_reaction`; `ReactionBar.vue` |
| [Notifications](notifications.md) | In-app notification center (header bell), live push, 7 trigger types | core | `user_notification`; `NotificationBell.vue` |
| [Web push](web-push.md) | VAPID web push with per-category toggles, goal/kickoff triggers | core | `push_subscription`, `push*` user cols; `server/utils/push/*` |
| [Chat](chat.md) | E2E-encrypted league chat: threads, mentions, reactions, images, moderation | 1.36.0, 1.42.0 | `chat_message`, `chat_attachment`, `chat_identity`, `league_chat_key`, `chat_message_report` |
| [Tamper-evidence](tamper-evidence.md) | Commit-reveal hash-chain ledger of score picks, public `/verify` | v1.33.0 | `prediction_commitment`, `commitment_chain_head`; `shared/commitment.ts` |
| [Share images](share-images.md) | Server-rendered OG/share cards (satori + resvg), signed tokens | core | `server/utils/share/*`, `routes/og/share/[token].get.ts` |
| [PWA](pwa.md) | Installable app + install/download/reload UX | v2.1.0 | `PwaBanner.vue`, `pwa-status.client.ts` |
| [Image storage](image-storage.md) | Pluggable fs/s3 backend; avatars + chat blobs out of Postgres | v2.0.0 | `server/utils/storage/*`, `media:migrate-blobs` |
| [Changelog](changelog.md) | In-app release history (`/about`) + "What's new" badge, rendered in the active locale | core | `CHANGELOG.md`, `i18n/changelogs/*`, `useChangelog.ts` |
| [Easter eggs](easter-eggs.md) | Konami "My Little Prono" skins, pony reactions, Klingon locale | hidden | `app/utils/skins.ts`, `public/skins/*`, `ng-skin` cookie |

## Cross-cutting architecture

Several features lean on shared subsystems documented under
[../architecture/](../architecture/index.md): the [live WebSocket
hub](../architecture/realtime.md), [pluggable storage](../architecture/storage.md),
[external providers](../architecture/providers.md), and the [satori/resvg + PWA
rendering stack](../architecture/rendering.md).
