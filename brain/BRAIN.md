# BRAIN - Nostragoalus knowledge base

The map of the codebase, written so a developer or AI can understand the app
**without reading the source**. Start here, follow the links, stop when you have
the answer. Every leaf doc cites the real source files if you need to go deeper.

> Product: **Nostragoalus** (repo dir `nostragoalus`) - a football score-prediction game.
> Friends predict match scores, earn points by closeness, ranked per competition.
> Stack snapshot in [stack.md](stack.md); current version is **2.16.2**.

## How to use this

1. Know the topic? Jump straight to its file via the indexes below.
2. Have a question, not a topic? Scan **Find by question** first.
3. Need a term defined? See [glossary.md](glossary.md).
4. Want the "why" behind a design? See [decisions.md](decisions.md).

The brain is a tree: this file -> two folder indexes
([architecture/index.md](architecture/index.md),
[features/index.md](features/index.md)) -> leaf docs. Don't grep the whole tree;
use the indexes.

## Top-level docs

| Doc | What's here |
|---|---|
| [stack.md](stack.md) | Exact technologies + versions (Nuxt, Vue, Drizzle, better-auth, ...). |
| [operations.md](operations.md) | mise tasks, Docker, the gate, releases, backups, env vars, deploy. |
| [glossary.md](glossary.md) | Domain + technical terms in one place. |
| [decisions.md](decisions.md) | The non-obvious design decisions and their rationale. |

## Architecture (the how) - [architecture/index.md](architecture/index.md)

| Doc | What's here |
|---|---|
| [overview.md](architecture/overview.md) | Layering rule, request lifecycle, the four code surfaces. Read first. |
| [server.md](architecture/server.md) | Routes, services, errors, `defineValidatedHandler`, tasks, plugins. |
| [client.md](architecture/client.md) | Nuxt config, pages/routing, vue-query composables, components, footguns. |
| [database.md](architecture/database.md) | Schema groups, enums, migrations, the shared-dev-DB caveat, test DB. |
| [auth.md](architecture/auth.md) | better-auth, SSO (encrypted), passkeys, 2FA, API keys, admin model. |
| [realtime.md](architecture/realtime.md) | WebSocket hub, live event types, presence, reconnecting client. |
| [webrtc.md](architecture/webrtc.md) | Peer-to-peer voice: mesh, STUN/TURN, self-hosted coturn, ephemeral creds. |
| [storage.md](architecture/storage.md) | Pluggable fs/s3 blob storage, avatars, chat ciphertext, migration. |
| [rendering.md](architecture/rendering.md) | satori/resvg share images + PWA service worker, the SSR footguns. |
| [providers.md](architecture/providers.md) | FIFA match data, Sofascore odds, FIFA ranking, the cycletls engine. |
| [testing.md](architecture/testing.md) | The 98% gate, vitest projects, pglite, factories, and the out-of-band Playwright e2e harness. |
| [i18n.md](architecture/i18n.md) | Five locales (en/fr/th/tlh/ar), the all-locales rule. |
| [rtl.md](architecture/rtl.md) | Right-to-left: dynamic `<html dir>`, logical CSS, the mirrored bracket, icon flipping (Arabic). |

## Features (the what) - [features/index.md](features/index.md)

| Doc | What's here |
|---|---|
| [competitions.md](features/competitions.md) | Multi-competition model + the `/[competition]/` routing. |
| [predictions-and-scoring.md](features/predictions-and-scoring.md) | The core loop: predict, lock, finalize, score. |
| [pick-guard.md](features/pick-guard.md) | Outstanding-picks nudge + outlandish-score confirm. |
| [champion-pick.md](features/champion-pick.md) | Per-competition winner pick, FIFA-rank tier payouts. |
| [best-scorer.md](features/best-scorer.md) | Golden Boot pick, goal-event-derived award. |
| [stats.md](features/stats.md) | Player rankings tab: top scorers + top assists. |
| [analytics.md](features/analytics.md) | Personal analytics: per-competition bias report on your own picks (mid-tournament). |
| [head-to-head.md](features/head-to-head.md) | Head-to-head: compare two players over their shared scored picks. |
| [leagues.md](features/leagues.md) | Competition-scoped groups, roles, visibility, SSO auto-join. |
| [onboarding-tour.md](features/onboarding-tour.md) | One-time spotlight walk-through of the core actions for new players; replayable from the account menu. |
| [connected-devices.md](features/connected-devices.md) | Account page lists active login sessions (device/IP/last-active) with per-device and bulk sign-out. |
| [sso-provisioning.md](features/sso-provisioning.md) | SSO onboarding lifecycle, connection test, OIDC test-sign-in claim preview, DNS domain verify + bypass, SCIM provisioning. |
| [league-modes.md](features/league-modes.md) | Per-league scoring modes (easy/hard/hardcore) + base pick / override. |
| [crowd-bot.md](features/crowd-bot.md) | The "ghost" bot personas: consensus 🤖, evil twin 😈, equalizer ⚖️. |
| [odds.md](features/odds.md) | 1X2 decimal odds (Sofascore + BetExplorer). |
| [reactions.md](features/reactions.md) | Match + chat emoji reactions. |
| [live-viewers.md](features/live-viewers.md) | Real-time "N watching now" per-match viewer count. |
| [multiview.md](features/multiview.md) | Configurable grid of live match tiles/streams, URL-persisted, focus-following chat. |
| [notifications.md](features/notifications.md) | In-app notification center (the bell). |
| [web-push.md](features/web-push.md) | VAPID push, per-category toggles, live goal/kickoff. |
| [chat.md](features/chat.md) | E2E-encrypted league chat (threads, mentions, moderation, images). |
| [dms.md](features/dms.md) | E2E-encrypted one-to-one direct messages, global dock. |
| [voice-chat.md](features/voice-chat.md) | Peer-to-peer WebRTC audio calls: 1:1 DM + small league (match-scoped) rooms; mesh, coturn. |
| [tamper-evidence.md](features/tamper-evidence.md) | Commit-reveal hash-chain ledger + `/verify`. |
| [past-pick-counterfactual.md](features/past-pick-counterfactual.md) | Owner-only "an earlier pick of yours would have scored", live + full-time. |
| [share-images.md](features/share-images.md) | Prediction share cards. |
| [pwa.md](features/pwa.md) | Install + update UX. |
| [image-storage.md](features/image-storage.md) | Blobs out of Postgres (feature view). |
| [changelog.md](features/changelog.md) | In-app release history + "What's new" badge, rendered by locale. |
| [achievements.md](features/achievements.md) | Competition-end trophies + milestone badges, the trophy cabinet and "my showcase". |
| [rewards.md](features/rewards.md) | Per-league prizes for the trophy criteria: owner config + live winner standings. |
| [roadmap.md](features/roadmap.md) | Public roadmap + community suggestions and upvotes, admin triage. |
| [wrapped.md](features/wrapped.md) | Tournament Wrapped: post-final recap deck + shareable summary card. |
| [easter-eggs.md](features/easter-eggs.md) | MLP skins, pony reactions, the Klingon locale. |

## Find by question

| If you're asking... | Go to |
|---|---|
| Where does business logic go? Why are routes thin? | [architecture/overview.md](architecture/overview.md) |
| How do I add a validated mutation route? | [architecture/server.md](architecture/server.md) |
| What error maps to which HTTP status? | [architecture/server.md](architecture/server.md) |
| How is a prediction scored? When does it lock? | [features/predictions-and-scoring.md](features/predictions-and-scoring.md) |
| How does "an earlier pick of yours would have scored" work? | [features/past-pick-counterfactual.md](features/past-pick-counterfactual.md) |
| How do the bots (consensus/evil-twin/equalizer) get their scoreline? | [features/crowd-bot.md](features/crowd-bot.md) |
| Why did my new column not appear in dev? | [architecture/database.md](architecture/database.md) |
| How do I add a user-facing string? | [architecture/i18n.md](architecture/i18n.md) |
| How does live update reach the client? | [architecture/realtime.md](architecture/realtime.md) |
| How is "N watching now" counted per match? | [features/live-viewers.md](features/live-viewers.md) |
| Where are images stored, and how do I migrate them? | [architecture/storage.md](architecture/storage.md), [features/image-storage.md](features/image-storage.md) |
| How is SSO configured and kept secret-safe? | [architecture/auth.md](architecture/auth.md) |
| How does an admin onboard an SSO provider (test/verify) or use SCIM? | [features/sso-provisioning.md](features/sso-provisioning.md) |
| How do I cut a release? What bumps major? | [operations.md](operations.md) |
| Why Sofascore / FIFA ranking and not odds? | [decisions.md](decisions.md) |
| How does a brand-new player learn the app (the spotlight tour)? | [features/onboarding-tour.md](features/onboarding-tour.md) |
| What's the konami easter egg? | [features/easter-eggs.md](features/easter-eggs.md) |

## Maintaining the brain

This brain is **load-bearing documentation**: it must stay true to the code.
When a change makes a brain doc wrong, fix the doc in the same change. When you
discover the brain disagrees with reality, the code wins - correct the brain and
note it. The enforceable version of this rule lives in the repo's `CLAUDE.md`
("Keep the brain current"). New feature -> new `features/<name>.md` + a row in
[features/index.md](features/index.md) + a row here.
