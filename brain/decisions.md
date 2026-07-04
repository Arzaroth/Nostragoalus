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
- **Multi-view keeps one chat that follows focus, not per-cell chats.** Chat is
  per-league end-to-end encrypted and each `useLeagueChat` opens its own socket
  and decrypts independently, so N per-cell chats would multiply sockets and
  redundant decryption, and the singleton route-driven dock can't render several
  threads. The multiview publishes its focused match to an app-level channel
  (`useMultiviewFocus`) that the single dock follows; an inbox/deep-link click on
  a gridded match focuses the cell rather than navigating. For the same reason the
  play-by-play, presence and reaction sockets mount for the focused cell only, and
  scores ride one `useLiveMatches` subscription for the whole grid. See
  [features/multiview.md](features/multiview.md).

## Operations

- **Shared dev pgdata + a timestamp-ordering migrator** means a stale branch's
  older-timestamped migration gets skipped on the shared DB. The fix is rebase +
  regenerate. Captured because it caused login 500s. See
  [architecture/database.md](architecture/database.md).
- **Feature work starts in a worktree + branch by default**, and ships only
  through feature-treatment (adversarial review + green gate). Nothing merges
  without it.

## SSO onboarding + SCIM

- **The onboarding flow reverses the old single-tenant "DNS verify buys nothing"
  call.** New providers go draft -> connection test -> domain verify (DNS TXT) or
  admin bypass -> enable, so a half-configured provider can't go live. Bypass is
  the admin's easy path; the DNS proof is there for a future delegated/multi-tenant
  world. `domainVerified` defaults true in the schema only to grandfather
  pre-1.6.x rows - the plugin forces it false on register, so the live path never
  relies on the default.
- **The OIDC test sign-in is hand-rolled as a dry-run** (the plugin offers no
  non-provisioning round-trip): a nonce-secured public callback captures the
  claims without ever creating a user/session or running `provisionUser`. SAML
  gets a static bindings preview instead - a live SAML ACS must be pre-registered
  at the IdP, which most IdPs require.
- **The SCIM token is stored hashed, not envelope-encrypted.** The plugin's
  `storeSCIMToken: 'hashed'` mirrors the api-key precedent (shown once, hashed
  compare), so the encrypted-adapter need not grow a model->fields map. The
  session-only SCIM management endpoints are blocked over HTTP because any
  signed-in user could otherwise mint a provider-restricted provisioning bearer.
- **Domain verification is hand-rolled, not `auth.api.verifyDomain`**, to dodge
  the plugin's registering-admin-only owner gate (multi-admin safe), while keeping
  the plugin's `_better-auth-token-{providerId}` identifier + TXT format so the
  plugin's own endpoint stays compatible. See
  [features/sso-provisioning.md](features/sso-provisioning.md).
- **SCIM deprovisioning forced the better-auth family from 1.6.18 to 1.6.23.**
  1.6.18's `@better-auth/scim` only provisions (it parses `active` but never maps
  it); `active:false -> ban` lands in 1.6.2x. The whole family moves in lockstep
  (shared `@better-auth/core`). 1.6.23 also makes an SSO and a SCIM provider id
  mutually exclusive, so the SCIM connection uses a derived `{providerId}-scim`
  id; provisioned users still link to their SSO login by email.

## Achievements and trophies

- **The achievement catalog lives in code, not the DB.** `user_achievement` only
  records what was unlocked; the badge list, thresholds and presentation are a
  code catalog (`server/utils/achievements/catalog.ts`). Badges are behaviour, not
  content: they track the scoring logic, want type-safety + review, and never need
  runtime editing - a data table would only add migration ceremony.
- **Trophies are derived, never stored as truth.** `awardCompetitionTrophies`
  recomputes the winners from the settled leaderboard/prediction state each
  finalize tick and reconciles `competition_award`, mirroring the champion /
  best-scorer "derive, don't mutate" award. Reconciling (not delete + reinsert)
  keeps `awardedAt` stable and lets only genuinely-new trophies notify. Ties share.
- **The France prize is generalized to a configurable "featured team".** The
  source contest awarded the best predictor of France's matches; the app is
  multi-team and multi-locale, so `competition.featuredTeamCode` (default `FRA`)
  drives one team-specialist trophy that names its team, instead of hard-coding
  France or minting a trophy per participating team.
- **Cabinet + showcase are per-competition**, matching every other page's
  `/[competition]/` scope; global badges like the secret unlock still surface in
  each competition's cabinet. See [features/achievements.md](features/achievements.md).
- **An achievement tier only ever climbs.** Batch evaluation grades a badge up when
  the metric crosses a higher threshold, but a rescore that drops the metric refreshes
  the stored progress without demoting the tier - a badge, once earned, is a
  high-water mark. Streaks are made deterministic by tiebreaking equal kickoffs on
  match id, and night-owl reads the UTC hour explicitly, so both are stable regardless
  of DB row order or server timezone.

## League rewards

- **Prizes are per-league, and their winners are derived live at read time, not
  stored.** The contest is a league's own (best among its members, not the global
  trophy). `computeCriteriaWinners` is the global trophy computation parameterized
  by `{ leagueId, memberIds }`; `getRewardStandings` runs it on demand, so a league
  sees who is currently leading each prize and it settles at competition end - no
  finalize hook, no league-award table. See [features/rewards.md](features/rewards.md).
- **Reward images reuse the avatar storage seam** (content-addressed
  `reward/<sha>.<ext>`, served at `/api/media/reward/[key]`); the route resolves the
  uploaded data URL to a key so the reward service stays storage-free and testable.
- **A prize leader's name is masked to the viewer's leaderboard entitlement.** The
  prize `link` renders as an anchor href, so it is validated to `http(s)` only (a
  `javascript:` URL would be stored XSS against every member). Likewise the current
  leader's `displayName` respects board visibility: admin-hidden members, and
  private profiles seen by a non-member, keep their standings slot but come back
  nameless (the UI shows a neutral placeholder) rather than leaking a name the board
  itself conceals. See [features/rewards.md](features/rewards.md).

## Tournament Wrapped

- **Tournament Wrapped is post-final only, and read-side only.** The recap gates
  on `hasScoredFinal` (a FINAL whose `scoringState` is `SCORED`), stricter than the
  trophy gate `hasDecidedFinal` (winner set): before finalize scores the final the
  numbers move, bonuses are zero and the haul is incomplete, so gating on the
  winner alone would show a "frozen" but wrong recap in the sync -> finalize window. No new tables - every slide derives from persisted
  per-prediction points, the achievements aggregator (so recap and badges cannot
  disagree), award/badge rows and chat row counts. The rank journey is REPLAYED
  from scored predictions per round (prediction points only) rather than
  snapshotted: there was no history table, and post-final the replay is frozen and
  cacheable. Chat stats stay counts-only because message bodies are E2EE; the
  server only ever sees row counts and plaintext reaction glyphs.
- **The wrapped share card gets its own HMAC token family** (user + competition,
  domain string `nostragoalus/wrapped-card/v1`), not an extension of the
  prediction token payload - two token families that can never be swapped are
  simpler to reason about than one payload with two shapes.
