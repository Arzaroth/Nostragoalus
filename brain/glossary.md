# Glossary

One-stop definitions for the domain and technical terms used across the brain and
the code. Alphabetical.

## Domain

- **Nostragoalus** - the product brand (a pun on "Nostradamus"). The repo
  directory is `mpp`; never call the product "MPP" in UI. App name is
  config-driven (`runtimeConfig.public.appName`).
- **Competition** - one tournament (e.g. FIFA World Cup 2026). A row in the
  `competition` table; the app is multi-competition by design. The active one is
  a URL path prefix. See [features/competitions.md](features/competitions.md).
- **Round** - a stage slice of a competition: a group matchday or a knockout
  round (`round_kind` = GROUP_MATCHDAY | KNOCKOUT).
- **Stage** - GROUP, R32, R16, QF, SF, THIRD_PLACE, FINAL.
- **Match** - one fixture; has a `match_status` lifecycle
  (SCHEDULED -> LIVE/PAUSED -> FINISHED, plus
  POSTPONED/CANCELLED/SUSPENDED/AWARDED/INTERRUPTED).
- **Prediction** - a user's home/away score guess for a match, locked at kickoff.
- **Joker** - a single ×2 multiplier a user spends on one prediction per round.
- **Trophy** - a rare, competition-end award (OVERALL, GROUP_PHASE,
  KNOCKOUT_PHASE, MADAME_IRMA, TEAM_SPECIALIST), derived at finalize and stored in
  `competition_award`. See [features/achievements.md](features/achievements.md).
- **Achievement (badge)** - a milestone unlocked during play from a code-defined
  catalog, graded bronze/silver/gold (`user_achievement`).
- **Trophy cabinet** - a user's full gallery of trophies + achievements on their
  profile (earned lit, locked greyed).
- **Showcase** - the curated set of earned achievements a user pins to show off,
  per competition (max 3 slots, achievements only - trophies are not pinnable).
- **Madame Irma** - the trophy for the most exact scorelines (a fortune-teller
  pun; from the source contest's "most exact scores" prize).
- **Featured team** - `league.featuredTeamCode`, the team a league's TEAM_SPECIALIST
  prize tracks, picked by an owner/moderator (no default; the prize is disabled until
  one is set). Was once a per-competition admin setting driving a global trophy; that
  global Team Specialist trophy is no longer minted. See [features/rewards.md](features/rewards.md).
- **Champion pick** - a per-competition guess of the tournament winner; pays a
  FIFA-rank-tiered bonus snapshotted at pick time. See
  [features/champion-pick.md](features/champion-pick.md).
- **Best scorer / Golden Boot pick** - a guess of the top scorer; pays a bonus
  resolved from goal events. See [features/best-scorer.md](features/best-scorer.md).
- **Bot / persona** - a synthetic, display-only ghost participant scored by the
  real engine. Three personas: **consensus** (the crowd's MODE/MEAN pick),
  **evil twin** (per-user: your own picks with each score swapped), **equalizer**
  (always a draw). Each is an on-the-fly `botUserId(persona)` row. See
  [features/crowd-bot.md](features/crowd-bot.md).
- **League** - a competition-scoped group of players that filters the views
  (leaderboard, chat). Predictions stay global/user-scoped. See
  [features/leagues.md](features/leagues.md).
- **Opt-out** - a `league_opt_out` row meaning "never auto-re-add me" (so SSO
  auto-join respects a deliberate leave).
- **Leaderboard / standings** - the per-competition (or per-league) ranking.
- **Finalize** - the idempotent "derive-don't-mutate" step that scores a finished
  match and awards tournament bonuses. See
  [features/predictions-and-scoring.md](features/predictions-and-scoring.md).
- **Scoring tiers** - EXACT (3) / DIFF (2) / OUTCOME (1) / MISS (0) base points,
  plus crowd-rarity and optional odds bonuses.
- **Tournament Wrapped** - the post-final recap deck (a user's tournament as a
  slide show) plus a shareable summary card. Gated on a SCORED final, read-side
  only, every slide derived from persisted data. See
  [features/wrapped.md](features/wrapped.md).

## Tamper-evidence

- **Commitment** - a salted hash binding a user's pick to a match, appended to an
  append-only ledger before kickoff.
- **Reveal / opening** - publishing the score + salt after kickoff so anyone can
  verify the commitment.
- **Subject** - `sha256(userId)`, the pseudonym a commitment binds to (never the
  raw user id).
- **Ledger / chain head** - the `prediction_commitment` append-only chain and its
  singleton `commitment_chain_head`. See
  [features/tamper-evidence.md](features/tamper-evidence.md).
- **Witnessing** - a browser pinning the highest chain head it verified and later
  proving the chain still extends it (a CT-style consistency proof).

## Technical

- **Service** - a function in `server/utils/<feature>/service.ts` taking
  `AppDatabase` first and throwing domain errors. The covered logic surface.
- **AppDatabase** - the Drizzle `PgDatabase` type every service accepts
  (`db/types.ts`).
- **`defineValidatedHandler`** - the route wrapper that does auth + zod body
  validation. See [architecture/server.md](architecture/server.md).
- **The gate** - typecheck + 98% coverage tests + component tests + build, run
  before any merge. See [architecture/testing.md](architecture/testing.md).
- **Feature-treatment** - the ritual to ship a branch: rebase -> parallel review
  -> fix -> gate -> merge -> release -> remove worktree.
- **Epoch (chat)** - the key-version counter on E2E chat; rotating the league key
  bumps the epoch. See [features/chat.md](features/chat.md).
- **DM thread** - a one-to-one direct-message conversation (`dm_thread`), stored
  as a canonical ordered participant pair (`userAId < userBId`, unique). Messages
  are `chat_message` rows scoped by `dm_thread_id` instead of a league, reusing the
  chat crypto + reaction/attachment/reply stack. See
  [features/dms.md](features/dms.md).
- **Thread key epoch** - the key-version counter on a DM thread (`dm_thread.keyEpoch`);
  the per-thread symmetric key is sealed to each participant per epoch
  (`dm_thread_key`), so rotating it bumps the epoch and clients keep an epoch->key
  map to read old history. The [chat](features/chat.md) league-key epoch for a
  two-member room. See [features/dms.md](features/dms.md).
- **Room key** - a chat room's id for unread tracking: the `matchId` of a match
  thread, or the `__global__` sentinel for the league room (`roomKeyFor`). The
  cross-league inbox keys unread per `leagueId::roomKey`. See
  [features/chat.md](features/chat.md).
- **Read marker** - the per-room "last read" timestamp (`chat_room_read`) that
  makes chat unread persistent and cross-league; there is no per-message read
  receipt. See [features/chat.md](features/chat.md).
- **Provider** - an external data source (FIFA match data, Sofascore odds, FIFA
  ranking), accessed provider-agnostically. See
  [architecture/providers.md](architecture/providers.md).
- **cycletls / JA3** - a uTLS HTTP engine that mimics a browser's TLS fingerprint
  so Cloudflare-class WAFs don't 403 the request (odds + link unfurl).
- **Gameday stories** - FIFA's in-tournament stats feed (`gameday-prod.fifa.mangodev.co.uk`)
  behind an anonymous ~24h Bearer token; the source of the live edition's top
  scorers + assists when the official aggregate is still empty. See
  [architecture/providers.md](architecture/providers.md).
- **VAPID** - the keypair scheme that authorizes web-push to a browser endpoint.
- **Storage driver** - the pluggable `fs`/`s3` blob backend for avatars + chat
  images. See [architecture/storage.md](architecture/storage.md).
- **Multi-view** - the `/[competition]/multiview` grid that shows several match
  tiles or streams at once; layout, cells and focus persist in the URL. See
  [features/multiview.md](features/multiview.md).
- **Skin** - a cosmetic theme orthogonal to light/dark; the unlockable ones are
  the MLP easter egg. See [features/easter-eggs.md](features/easter-eggs.md).
- **tlh** - the Klingon locale code; one of the five required locales and itself
  an easter egg.
- **ar** - the Arabic locale code; the first right-to-left locale. See
  [architecture/rtl.md](architecture/rtl.md).

## Auth / SSO

- **SSO provider lifecycle** - `draft` (configuring) / `enabled` (live) /
  `disabled` (paused) on `sso_provider.status`. Only `enabled` is offered for
  login and links accounts; disabling never revokes existing sessions. See
  [features/sso-provisioning.md](features/sso-provisioning.md).
- **Connection test** - the automated OIDC (discovery/JWKS) / SAML (cert/entry
  point) pre-flight; a passing result is the gate to enable a provider.
- **Test sign-in (dry-run)** - a real OIDC round-trip that previews the claims an
  IdP returns, mapped to our fields, without creating a user/session or running
  `provisionUser`.
- **Domain verification / bypass** - proving ownership of a provider's email
  domain via a DNS TXT record (`_better-auth-token-{providerId}`), or an admin
  bypass (single-tenant, trusted).
- **SCIM** - System for Cross-domain Identity Management; the IdP-driven protocol
  that provisions/deprovisions users over `/api/auth/scim/v2/*`.
- **Deprovision** - SCIM `active:false`: ban the user (block login + revoke
  sessions) while keeping their data; `active:true` reactivates.
