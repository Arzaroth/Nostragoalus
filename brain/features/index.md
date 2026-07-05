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
| [Onboarding tour](onboarding-tour.md) | One-time spotlight walk-through of the core actions for new players; replayable from the account menu | unreleased | `onboardingTourDismissedAt`; `OnboardingTour.vue`, `useOnboardingTour.ts`, `server/utils/onboarding/*` |
| [Bot personas](crowd-bot.md) | Synthetic ghost bots: consensus, evil twin, equalizer | core | `botUserId`; `server/utils/bot/service.ts`, `server/api/bot/*` |
| [Odds](odds.md) | Decimal 1X2 bookmaker odds (Sofascore primary, BetExplorer backup) | core | `odds_snapshot`; `server/utils/odds/*` |
| [Reactions](reactions.md) | Six-emoji match reactions, reused by chat | core | `match_reaction`; `ReactionBar.vue` |
| [Live viewers](live-viewers.md) | Real-time "N watching now" per-match viewer count over the WS hub | 2.5.0 | `server/utils/live/viewers.ts`, `useMatchPresence.ts`, `MatchViewers.vue` |
| [SSO onboarding + SCIM](sso-provisioning.md) | Provider lifecycle (draft/enabled/disabled), connection test, OIDC test-sign-in claim preview, DNS domain verification + admin bypass, SCIM 2.0 provisioning | 2.9.0 | `sso_provider` (status, last_test_*), `scim_provider`; `server/utils/sso/*`, `server/api/admin/sso/**` |
| [Multi-view](multiview.md) | Configurable grid (1/2x1/2x2/3x3) of live match tiles or streams, URL-persisted, one focus-following chat | 2.11.0 | `app/utils/multiview.ts`, `app/components/multiview/*`, `useMultiviewFocus.ts` |
| [Notifications](notifications.md) | In-app notification center (header bell), live push, 7 trigger types | core | `user_notification`; `NotificationBell.vue` |
| [Web push](web-push.md) | VAPID web push with per-category toggles, goal/kickoff triggers | core | `push_subscription`, `push*` user cols; `server/utils/push/*` |
| [Chat](chat.md) | E2E-encrypted league chat: threads, mentions, reactions, images, moderation | 1.36.0, 1.42.0 | `chat_message`, `chat_attachment`, `chat_identity`, `league_chat_key`, `chat_message_report` |
| [Tamper-evidence](tamper-evidence.md) | Commit-reveal hash-chain ledger of score picks, public `/verify` | v1.33.0 | `prediction_commitment`, `commitment_chain_head`; `shared/commitment.ts` |
| [Past-pick counterfactual](past-pick-counterfactual.md) | Owner-only "an earlier pick of yours would have scored", live + full-time, off the ledger | 2.5.0 | `prediction_commitment`; `server/utils/past-pick/*`, `PastPickHint.vue` |
| [Share images](share-images.md) | Server-rendered OG/share cards (satori + resvg), signed tokens | core | `server/utils/share/*`, `routes/og/share/[token].get.ts` |
| [PWA](pwa.md) | Installable app + install/download/reload UX | v2.1.0 | `PwaBanner.vue`, `pwa-status.client.ts` |
| [Image storage](image-storage.md) | Pluggable fs/s3 backend; avatars + chat blobs out of Postgres | v2.0.0 | `server/utils/storage/*`, `media:migrate-blobs` |
| [Changelog](changelog.md) | In-app release history (`/about`) + "What's new" badge, rendered in the active locale | core | `CHANGELOG.md`, `i18n/changelogs/*`, `useChangelog.ts` |
| [Achievements](achievements.md) | Trophy cabinet + "my showcase": 5 competition-end trophies, ~20 milestone badges, curated per-competition achievements showcase | v2.14.0 | `competition_award`, `user_achievement`, `showcase_pin`; `server/utils/{awards,achievements}/*` |
| [Rewards](rewards.md) | Per-league real-world prizes over 11 criteria (owner add/delete), per-league Team Specialist team, live winner standings, "prizes you hold" | v2.14.0 | `league_reward`; `server/utils/rewards/{service,criteria}.ts` |
| [Roadmap](roadmap.md) | Public `/roadmap` (planned/in-progress/shipped) + community suggestions users submit and upvote; admin triage | 2.12.0, 2.13.0 | `roadmap_item`, `roadmap_vote`; `server/utils/roadmap/*`, `useRoadmap.ts`, `roadmap.vue` |
| [Tournament Wrapped](wrapped.md) | Post-final personal recap: story-slide deck + shareable summary card | 2.15.0 | `server/utils/wrapped/service.ts`, `WrappedDeck.vue`, `server/utils/share/wrapped-*` |
| [Easter eggs](easter-eggs.md) | Konami "My Little Prono" skins, pony reactions, Klingon locale | hidden | `app/utils/skins.ts`, `public/skins/*`, `ng-skin` cookie |

## Cross-cutting architecture

Several features lean on shared subsystems documented under
[../architecture/](../architecture/index.md): the [live WebSocket
hub](../architecture/realtime.md), [pluggable storage](../architecture/storage.md),
[external providers](../architecture/providers.md), and the [satori/resvg + PWA
rendering stack](../architecture/rendering.md).
