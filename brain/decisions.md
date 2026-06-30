# Decisions

The non-obvious design decisions and the "why" behind them - the things you
cannot recover by reading the code, only by reading the rationale. New decisions
get appended here (newest concerns near their feature). Each entry links to the
feature/architecture doc that implements it.

## Product shape

- **Multi-competition from day one.** A `competition` table, not a hardcoded World
  Cup, so a new tournament is a row and a provider config, not a rebuild. First
  competition is FIFA World Cup 2026. See
  [features/competitions.md](features/competitions.md).
- **Competition is the URL, league is a cookie.** The active competition lives in
  the path (`/[competition]/...`) so links are shareable and never show the wrong
  data. League selection is the `ng-league` cookie (a map per competition),
  deliberately NOT in the URL. See [features/competitions.md](features/competitions.md)
  and [features/leagues.md](features/leagues.md).
- **Leagues filter views, never predictions.** A user's predictions are always
  global/user-scoped; a league only scopes which players you see and the chat.
  Crowd bonuses are always computed against the GLOBAL locked histogram so league
  scoping can never shrink a denominator and change someone's score.
- **Ranked per competition, public profiles by default.** No private leagues in
  the original product; leagues were added later as an overlay.
  `user.profile_private` is a self opt-out of ranking, distinct from the
  admin-only `hiddenFromLeaderboard`.

## Scoring

- **Derive-don't-mutate finalize.** Scoring a finished match is idempotent: it
  derives points from the stored result + locked predictions and writes a
  `match_score_event` snapshot, so re-running never double-counts. Scored on the
  90' full-time result. See
  [features/predictions-and-scoring.md](features/predictions-and-scoring.md).
- **Champion points are FIFA-rank tiers, snapshotted at pick time.** Replaced a
  flat +10. Buckets 1-8/9-20/21-40/41+ pay 10/15/25/40; the rank and payout are
  frozen on the pick and never recomputed. **Why FIFA ranking and not odds:**
  Sofascore has no historical outright/champion odds and BetExplorer's archives
  are unreliable, while the FIFA archive is fully reproducible. See
  [features/champion-pick.md](features/champion-pick.md).
- **Best-scorer winner comes from stored goal events, not a finalize-time HTTP
  call.** Own goals excluded, ties all win, awarded inside the finalize
  transaction. See [features/best-scorer.md](features/best-scorer.md).
- **The outlandish-score confirm uses a flat absolute cap, not a sigma/z-score
  model.** A score is flagged when `home > 7 || away > 7 || home + away > 11`.
  Goal counts are low-count and Poisson-ish, so a variance-based bound
  miscalibrates; a fixed ceiling stays predictable and identical for every
  fixture. It's a confirm, not a block. See [features/pick-guard.md](features/pick-guard.md).

## External data

- **Sofascore is the primary odds provider** (user's explicit choice over The Odds
  API): free, keyless, and retroactive (so finished tournaments backfill), where
  The Odds API charges 10x for history. BetExplorer is the backup for bookmaker
  averages. Odds display is decimal only. See [features/odds.md](features/odds.md).
- **FIFA api.fifa.com/v3 is the default, keyless match-data provider.** Quirks are
  documented in [architecture/providers.md](architecture/providers.md) (penalty
  shootout goals excluded, the goal feed's assist field is the beaten keeper,
  matchday derived by date). football-data.org is a token-gated fallback.
- **cycletls (browser JA3) for WAF-guarded providers.** Node's default TLS
  fingerprint is 403'd by Cloudflare-class WAFs (Sofascore, some unfurl targets);
  one shared uTLS engine with a Chrome JA3 gets through. It needs `gcompat` in the
  Docker base stage. See [architecture/providers.md](architecture/providers.md).
- **Live player stats from FIFA's gameday stories, not the official aggregate.**
  FIFA's `/statistics/teams` aggregate stays empty for an in-progress edition, so
  the Stats tab's assists were wrong (derived from the lossy local `goal_event`
  timeline). The fifa.com stats page is fed by a separate "gameday" API
  (`gameday-prod.fifa.mangodev.co.uk`, anonymous ~24h Bearer token from
  `cxm-api.fifa.com`) that publishes the exact official rankings in-tournament;
  `getPlayerStats` uses it for the live edition and falls back to the aggregate
  once an edition ends (the stories 404). Both hosts are WAF-guarded so they go
  through cycletls. See [architecture/providers.md](architecture/providers.md).

## Tamper-evidence

- **In-DB hash-chain anchor only, scores only (phase 1).** An external anchor
  (OpenTimestamps) and champion/best-scorer commitments were deferred. The
  commitment binds `sha256(userId)`, not the raw id, so a public reveal proves
  integrity without deanonymizing private profiles. See
  [features/tamper-evidence.md](features/tamper-evidence.md).

## Rendering / client

- **Hand-rolled satori + resvg, not the nuxt-og-image module** - to keep deps and
  the route logic explicit. satori needs woff/ttf (not woff2) and never fetches
  remote images. See [architecture/rendering.md](architecture/rendering.md).
- **PWA `registerType: 'prompt'` + `injectManifest`.** Prompt so a deploy never
  swaps assets mid-prediction (the user clicks Reload). injectManifest (over
  generateSW) because the app ships a custom service worker for web push.
- **Never wrap a `.client.vue` in `<ClientOnly>`** and never call a composable in
  a `useSeoMeta` getter - both are prod-build-only failures. See
  [architecture/client.md](architecture/client.md).
- **Stylized tooltips only** (PrimeVue `v-tooltip`), never native `title=`, except
  to reveal truncated text. Tooltips are mobile-dead, so prefer always-visible
  affordances.

## Storage

- **Image blobs live outside Postgres in a pluggable fs/s3 backend; prod defaults
  to rustfs (S3).** Shipped as a MAJOR (v2.0.0) because it added a required
  stateful service + credentials, changed the backup contract, and nulled a
  column. Avatars are content-addressed; chat images stay E2E-encrypted and
  server-opaque. See [features/image-storage.md](features/image-storage.md).

## Notifications / push

- **The in-app bell shipped first, web push second, on top of it.** A
  notification's type is derived from its typed jsonb `data`, and a partial-unique
  `dedupeKey` keeps scheduled/finalize triggers idempotent. Push adds a browser
  opt-in master gate plus per-category toggles; `MATCH_LIVE` and `GOAL` are
  push-only/transient and predictor-scoped. See
  [features/notifications.md](features/notifications.md) and
  [features/web-push.md](features/web-push.md).
- **A chat @mention notifies cross-league without the server reading the message.**
  The chat is E2EE, so the mentioned ids ride as a plaintext `mentions[]` sidecar
  on the post; the server intersects them with the league's real members (and
  drops the sender, so a crafted client cannot push-spam) and fires a
  `CHAT_MENTION` bell + web push from that alone - copy carries room context only,
  never message text. The bell row doubles as the durable mention store (mentions
  are not a message column), which is what lets the unread-mention badge survive a
  reload. See [features/chat.md](features/chat.md).

## Chat unread / inbox

- **Chat unread is a per-room "last read" marker, not a per-message receipt.**
  `chat_room_read (userId, leagueId, roomKey -> lastReadAt)` keeps the inbox
  O(rooms), avoids a read-receipt's per-message x member write amplification and
  privacy surface, and lets unread be recomputed on load (it survives reload)
  rather than living only in a session counter. The inbox is cross-league: one
  global socket already delivers every league's `chat:new`, so single-league was
  only ever a client filter. An unmarked room counts messages since the user's
  league join (backlog-from-join), so the day-one count is truthful rather than
  silently zeroed. See [features/chat.md](features/chat.md).

## Operations

- **Shared dev pgdata + a timestamp-ordering migrator** means a stale branch's
  older-timestamped migration gets skipped on the shared DB. The fix is rebase +
  regenerate. Captured because it caused login 500s. See
  [architecture/database.md](architecture/database.md).
- **Feature work starts in a worktree + branch by default**, and ships only
  through feature-treatment (adversarial review + green gate). Nothing merges
  without it.
