# TODO

Deferred work, queued behind feature development.
Feature backlog with design notes lives in [ROADMAP.md](ROADMAP.md).

## Cross-league chat inbox (deferred from the feature-treatment review)

- [ ] **Fabricated-mention abuse**: the `mentions[]` sidecar on `messages.post` is
      client-supplied and now drives a durable `CHAT_MENTION` bell row + web push
      (`server/utils/chat/mentions.ts`). `notifyMentions` drops the sender and
      intersects with league members, so it can't spam cross-league or self - but a
      co-member can fabricate a mention of someone the visible (E2EE) text never
      named, and there's no rate limit on `messages.post`. The body is encrypted, so
      the server can't verify the sidecar; the recipient's `pushMentions` toggle is
      the only backstop. If it bites, add a per-sender post/mention rate limit (the
      proper fix needs server-visible mention truth, which E2EE precludes).
- [ ] **New-room mention badge lag**: when a room's first-ever activity is an
      @mention of you, the live `chat:new` frame triggers a `['chat','unread']`
      refetch (`useChatActivity`, the room isn't cached yet to patch) that can race
      ahead of the fire-and-forget `notifyMentions` insert, so the room briefly shows
      `unread=1, mentions=0` until a later refetch picks up the committed bell row.
      Harmless and self-heals; fixing it cleanly needs `notifyMentions` to commit
      before the post responds (giving up the fire-and-forget) or a mention-aware
      live frame the client can seed labels from.

## Past-pick counterfactual (deferred from the feature pass)

- [ ] **Extract a shared `buildMatchScoreInput` / score-the-locked-field helper**
      (deferred from the feature-treatment review). The `ScoreMatchInput`
      assembly in `server/utils/past-pick/service.ts` (the locked-field query +
      `actualOutcomeOdds` ODDS lookup + `forceJoker: countsDouble(stage)` +
      `scorePredictions`) is now a 4th verbatim copy of the same glue in
      `server/utils/leaderboard/live.ts`, `leaderboard/match.ts` and
      `sync/finalize.ts`. The scoring math is already shared; only this
      input-building glue is duplicated. A future scoring-input change (a new
      `bonusSource` needing its own lookup, a different field-lock predicate)
      must be edited in all four sites in lockstep or past-pick's replay silently
      diverges from what the live boards and finalize actually score. Out of
      scope here (touches three other gated services); extract once and adopt it
      in all four.

- [ ] Unify the past-pick counterfactual with the planned "evil twin" and
      "what-if stats" into a single "counterfactuals" surface, instead of three
      one-off lines/widgets. `server/utils/past-pick/service.ts` already replays a
      user's own swapped-off picks through the scoring engine; the shared shape
      (`shared/types/past-pick.ts`) and the synthetic-against-the-field scoring
      approach are the seam to build that surface on.
- [ ] The earlier picks are scored as synthetic predictions against the field as
      it locked (the kept pick stays in the crowd denominator, the earlier one is
      not), mirroring the consensus bot. A truer "if I had kept that pick instead"
      would swap the kept pick out of the histogram for the earlier one. Revisit
      if the crowd-rarity bonus ever makes the approximation visibly wrong.

## Stats tab (deferred from the feature pass)

- [x] The assist board re-ranked the goals-sliced `/api/competitions/scorers`
      result, so a high-assist/low-goal player could fall outside the goals top-N
      and never reach the assist board. Fixed: the endpoint now returns
      `{scorers, assists}` (`PlayerRankings`), each ranked and sliced on its own
      metric via `rankPlayers` in `scorers.get.ts` / `scorers.ts`.
- [ ] The view toggle (Fixtures / Standings / Stats) only renders when the
      competition has group standings (`hasGroups` in
      `app/pages/[competition]/matches/index.vue`), so a knockout-only competition
      shows no Stats tab even when scorer data exists. Decouple the Stats tab's
      visibility from group presence if such a competition is added.
- [ ] Team-level boards (best attack/defense, clean sheets) were scoped out; the
      `TeamSeasonStats` shape (`shared/types/match.ts`) already exists to feed them.
- [ ] The FIFA gameday player-stats path (`getPlayerStats` in
      `providers/fifa.ts`) and the `scorers.get.ts` source chain swallow all
      upstream failures (incl. `ProviderRateLimitError`) to fall back silently -
      acceptable for a 10-min-cached read endpoint, but there's no log/signal
      when the official source is down, so it can serve approximate local assists
      indefinitely unnoticed. Add an observability log on the fallback.
- [ ] `scorers.get.ts` calls `resolveCompetitionSeason` outside any try/catch
      (pre-existing, shared by other provider routes): a FIFA `/seasons` failure
      500s the public endpoint instead of falling back. Guard it (or make
      season-resolution resilient) so the Stats endpoint degrades gracefully.

## Pick guard (deferred from the feature pass)

- [ ] No component test exercises the outstanding-picks banner / "Jump to first"
      in `app/pages/[competition]/matches/index.vue` - the page pulls in
      `useFetch('/api/me/stats')`, `useMatches`, `useMyPredictions`,
      `useCrowdTotals` and the contained-scroll measuring, so mounting it under
      happy-dom is heavy and brittle. The counting/first-id logic is fully unit
      tested in `app/utils/outstanding-picks.ts`; cover the banner render + jump
      wiring if the page gets a test harness (or extract the banner into its own
      small component that can be mounted in isolation).

### Deferred from the feature-treatment review

- [ ] **Non-finite score bypasses the confirm**: `isOutlandishScore`
      (`app/utils/prediction-sanity.ts`) compares with `>`, so `NaN`/`Infinity`
      evaluate false and skip the confirm. ScoreInput's `@input` handler keeps a
      value when `typeof $event.value === 'number'`, and `typeof NaN === 'number'`,
      so a NaN could in principle auto-commit with no prompt. InputNumber is bounded
      `:min="0" :max="99"` and emits `null` not `NaN` in normal use, so this is
      defense-in-depth only - add a `Number.isFinite` backstop in the `@input`
      handler if PrimeVue ever starts emitting non-finite values.
- [ ] **Jump-to-first relies on endpoint ordering**: `firstOutstandingPickId`
      returns the first pickable-unpredicted match in list order, and the matches
      page feeds it `matches.value` raw, trusting it is kickoff-ascending (it is:
      the endpoint sorts `asc(kickoffTime)`). The "soonest" guarantee lives only in
      a comment - if the endpoint/`useMatches` ordering ever changes, the jump
      targets a non-soonest fixture with no test catching it. Sort defensively in
      the helper or assert the order in a page-level test if one is added.
- [ ] **Confirm-open refetch repaints the inputs**: opening the outlandish confirm
      blurs the input, clearing `editing`, which re-arms the props watcher in
      `ScoreInput.vue`. A background predictions refetch (live / 60s staleTime) can
      then overwrite the visible home/away under the open dialog. Accept still saves
      the right value (`acceptOutlandish` reads `pending`), so it is cosmetic, but
      the scoreline can visibly jump mid-decision. Keep `editing` true while the
      confirm is up if it proves distracting.

## Live viewers ("N watching now", deferred from the feature pass)

- [ ] **Multi-node undercount**: the viewer rooms live in `server/utils/live/viewers.ts`
      as in-process maps, so across a multi-instance deploy each node counts only
      its own sockets and the page shows an undercount (same limit as the rest of
      the in-process hub - the app is single-instance today). Scaling out needs a
      shared store / pub-sub for the rooms (Redis or similar): publish join/leave,
      sum the count across nodes, and fan `viewers:update` cluster-wide. Do it with
      (or after) the broader hub multi-node work, not standalone.
- [ ] `useMatchPresence` opens its own `useReconnectingSocket` (like `useLiveMatch`
      / `useCrowdTotals` / `useNotifications`), so the match page now holds yet
      another WS connection. Folds into the already-tracked "unify the WS consumers
      onto one shared socket" item under Notifications.
- [ ] The count is socket-level (one tab = one viewer, by design - the spec's
      de-dupe is per-socket), so one person with two tabs on the same match counts
      as two. If "people" semantics are ever wanted, ref-count by `userId` like
      presence does (guests would still need a per-socket fallback).

### Deferred from the feature-treatment review

- [ ] **Rate-limit the WS message handler (hub-wide)**: no frame in
      `server/routes/_ws.ts` is throttled. `viewing` is the sharpest case - each
      count change re-broadcasts `viewers:update` to the whole room
      (`broadcastViewerCounts` in `server/utils/live/hub.ts`), so one socket
      rapidly toggling its viewed match (join/leave/join) fans out N messages per
      toggle with N = room size. `subscribe` is also un-throttled and runs a DB
      query (`sendMatchSnapshot`) per frame. The proper fix is a per-socket frame
      budget / min-interval applied across the handler, not a one-off on
      `viewing`. Repeat-same-match is already a no-op (idempotent `setViewing`),
      so only toggling amplifies; matchId is length-capped to 64. Single-instance
      today; do this with the broader hub hardening.
- [ ] **Viewer count is spoofable upward**: the `viewing` frame has no auth gate
      (unlike `chat:typing` / `presence:ping`, which require `subscriber.userId`)
      because the count is meant to include guests. De-dupe is per-socket, so an
      attacker opening many anonymous sockets can inflate "N watching now". It is
      a soft vanity metric; the realistic mitigation is connection-level rate
      limiting (above), not auth-gating (which would drop genuine guest viewers).
- [ ] **Collapse the viewer rooms onto the subscriber registry**: `viewers.ts`
      keeps two parallel maps (`rooms`, `viewing`) and the hub fans out over them
      separately, while every other channel iterates the single `subscribers` set
      with an inline membership filter. Since a socket views exactly one match, a
      `viewingMatchId?: string | null` field on `LiveSubscriber` would let the
      count and fan-out reuse that pattern and make disconnect cleanup inherent
      (drop the subscriber -> drop the viewer), deleting both maps, the
      `ViewerToken` type, and the multi-match `setViewing` generality the callers
      never use. Correct as-is; this is a simplification, not a bug.

## Live bracket / penalty shootouts (deferred from the feature-treatment review)

- [ ] **Bracket cache bust misses the non-poll path**: `scores:poll` busts the
      bracket cache on a knockout terminal transition (now FINISHED or AWARDED),
      but a knockout finish observed only by the hourly fixtures refresh (not the
      live poll) never calls `invalidateBracketCache`, so the advancement waits
      out the full 10-min TTL. Wire the same invalidation into the hourly sync
      path. Separately, if the provider `/seasonbracket` endpoint lags the live
      feed, the post-bust rebuild can re-cache a not-yet-advanced bracket and pin
      it for the TTL; the WS winner-highlight overlay + `scores:changed` refetch
      mask the visible part, and advancement is eventually consistent.
- [ ] **Shootout side attribution falls back silently**: `normalizeFifaTimeline`
      (`server/utils/providers/fifa.ts`) derives the kick's `side` by matching
      `IdTeam` against the home/away team ids; if those ids are absent the
      Period-11 penalty-goal isn't counted and the badge falls back to the frozen
      regulation score - the exact bug this feature fixes. Unreachable in practice
      (a match at penalties always has both teams resolved), so it is defensive,
      but a guard / log would make the degradation explicit.
- [ ] **Unify the live-subscribe machinery**: `useLiveBracket`, `useLiveMatches`
      and `useLiveMatch` each roll their own `useReconnectingSocket` +
      `subscribe()` + re-subscribe `watch` + `match:update` overlay. Extract a
      shared `useLiveMatchSubscription(liveIds, { onUpdate, onScoresChanged })`
      so a protocol change lands in one place. Folds into the broader
      "unify the WS consumers onto one shared socket" item under Notifications.
- [ ] **Extract a shared `ttlCache<T>` helper**: `server/utils/bracket/cache.ts`
      is the ~7th hand-rolled `Map<string, { at, value }>` + TTL (see
      `bot/service.ts`, `chat/unfurl.ts`, `stats/alltime-h2h.ts`,
      `live/league-chat.ts`, `auth/email-verification.ts`). A single
      `ttlCache` with get/set/invalidate/evict would replace all of them.

## Live hardening (deferred from the feature-treatment review)

- [ ] **Chat mutations still leak league existence**: the `resolveLeagueManage`
      existence-leak fix (404 for both missing and outsider, never a 403 that
      confirms a private league is real) was applied to the league-management
      endpoints but NOT to the parallel chat mutations
      (`server/utils/chat/service.ts` postMessage / enableLeagueChat /
      disableLeagueChat / rotateLeagueChatKey / addWrappedKeys), which still do
      the split `NotFoundError` then `ForbiddenError`. Low risk (league.id is a
      random UUID, so blind enumeration is infeasible), but migrate them to the
      same combined-404 shape for consistency.
- [ ] **Goal pushes skip SUSPENDED/INTERRUPTED**: `push/live.ts` keeps its own
      narrow `LIVE_STATUSES = {LIVE, PAUSED}` and was not folded into the shared
      `matchIsInPlay` taxonomy, so a goal observed only while a match reads
      SUSPENDED/INTERRUPTED and then goes FINISHED never fires a live GOAL alert
      (the high-water dedup is otherwise correct). Decide whether a goal during a
      stoppage should alert (it may be under review) and align with the taxonomy.
- [ ] **Redundant membership / isAdmin lookups**: `leagues/[id]/chat/messages.get`
      re-fetches `getMembership` purely for `isAdmin` although `listMessages`
      already fetched it, and `me/stats.get` evaluates `isAdmin(event)` twice for
      a non-member admin (once inside `resolveLeagueView`, once standalone).
      Surface the role/admin-grant from the helper so the caller need not recompute.
- [ ] **Link-preview size cap is honest-header-only**: `chat/unfurl.ts` caps an
      oversized body via Content-Length, but an absent or lying Content-Length
      still buffers the full body in cycletls before the `.slice` (no streaming
      cap), so the memory-DoS path is only partially mitigated. Needs a streaming
      read cap if cycletls grows one.
- [ ] **Push re-subscribe can silently no-op under a race**: `push/service.ts`
      `setWhere(eq(userId, ...))` race-proofs the hijack guard, but if another
      account claims the endpoint between the SELECT pre-check and the upsert, a
      legitimate same-account re-subscribe updates 0 rows and returns success
      while that device receives no pushes. Detect the 0-row case and retry/throw.

## Calendar feed (deferred from the feature-treatment review)

- [ ] `server/utils/feed/token.ts` is a near-verbatim clone of
      `server/utils/share/token.ts` (b64url, sign-body/sign-token, the
      `MAX_TOKEN_LENGTH = 512` cap and the whole timing-safe verify path); only
      the domain string and payload shape differ, and feed already imports
      `SHARE_LOCALES` from share. Extract one shared signed-token codec so a
      future hardening of the verify path can't land on one keyless public route
      and miss the other.
- [ ] `FeedMatch.kickoffTime` is typed `Date | string` but every caller passes a
      Date (drizzle `timestamp` mode). A timezone-naive string would be parsed as
      local time by `new Date()` and shift the emitted UTC instant. Narrow to
      `Date`, or normalise on input, if a string source ever appears.
- [ ] The feed token is stateless, so it can only be revoked by rotating the app
      secret (which invalidates every user's link at once). If per-user feed
      revocation is ever wanted, fold a per-user salt/version into the payload.

## Prediction-lean map (deferred from the feature-treatment review)

- [ ] The "live-else-next" current-match pick (`pickCurrentMatches` in
      `app/utils/crowd-lean.ts`) is a 4th copy of the same status-pick micro-pattern
      already inline in `map.vue` (`live`/`next`), `NextMatchCta.vue` and
      `matches/index.vue`. crowd-lean now aligns to the shared `IN_PLAY_STATUSES`,
      but the other three still hardcode `LIVE`/`PAUSED` and so disagree on
      SUSPENDED/INTERRUPTED. Extract one shared `currentMatchForTeam` /
      live-else-next helper so the in-play set lives in one place.
- [ ] `WorldMap.client.vue` re-tints rings by writing `box-shadow` directly on each
      marker's `<img>` via `getElement()`. Works, but reaches around Leaflet's icon
      model; if marker rendering ever changes, prefer rebuilding the divIcon for the
      changed teams only (diff old vs new lean) over the direct DOM poke.

## Group tiebreakers + elimination (deferred from the feature-treatment review)

- [ ] The group-standings row select (`group, homeTeam, awayTeam, *Code, status,
      fullTime*` WHERE `stage='GROUP'`) is now hand-written in THREE places:
      `standings.get.ts`, `bracket.get.ts:groupStandingsFor`, and the insights
      service. Extend the existing deferred `selectGroupStandingsRows` extraction
      to cover `bracket.get.ts` too. `eliminated.get.ts` selects a different shape
      (adds `stage`+`winner`, drops names, no `stage` filter) and intentionally
      does not share it.
- [ ] The classic `['points', 'gd', 'gf']` criteria triple is repeated ~5x
      (tiebreakers.ts default + WC2026 best-third, standings.ts `DEFAULT_CRITERIA`,
      projection.ts `rankThirds` fallback). Extract one exported `CLASSIC` const.
- [ ] `GET /api/competitions/eliminated` (and `/standings`) are not in the sampled
      API response schemas (`response-schemas.json`); add on the next controlled
      regen (the inline `defineRouteMeta` OpenAPI already ships).
- [ ] `/api/competitions/eliminated` recomputes from scratch each call (scans all
      competition matches + brute-forces each group). Bounded and cheap (3^n with
      n<=6 per 4-team group, n>8 capped), so left uncached unlike the bracket
      endpoint; add a short TTL cache if it ever shows on a profile.
- [ ] Mid-group elimination is group-internal: it greys a team that cannot reach a
      qualifying-eligible group rank (top-2, or top-3 where best thirds exist). A
      3rd-placed team that is mathematically out of the *best-third* race across
      groups is only greyed once the group stage finishes (the cross-group signal),
      not the instant it becomes certain. Closing that needs a cross-group
      best-third enumeration; deferred as rare and combinatorially heavier.

## Match status: interrupted (deferred from the feature pass)

- No auto-void safety net for a match stuck `INTERRUPTED` that never resolves.
  It relies on FIFA flipping the code to FINISHED (resumed) or to an abandoned
  code (-> CANCELLED, which `finalize` voids). If the feed strands a match on 11
  forever, it sits in limbo. `POSTPONED` has a `POSTPONED_VOID_AFTER_MS` guard;
  consider an equivalent for INTERRUPTED.
- `AWARDED` matches still do not surface the per-match ranking
  (`matchHasStarted` excludes them) - a walkover can carry null scores, so this
  was left as-is. Revisit if forfeit handling ever needs a board.
- No "match interrupted" notification/push - the interruption is silent
  (kickoff/goal pushes exist, this transition does not fire one).
- FIFA code 11 is undocumented in the public enum; mapped to INTERRUPTED from
  the FRA-IRQ (2026-06-22) observation. If FIFA reuses 11 for something else,
  revisit `mapFifaStatus`.

## Test debt

### Unit / handler coverage

- [x] Auth catch-all blocking lists (`server/api/auth/[...all].ts`): the
      `SSO_LOCKED` (change-email / passkey registration / 2FA enable for
      SSO-managed accounts) and `SSO_ADMIN_ONLY` (plugin's public sso
      register/update/delete) path guards are security-relevant and only
      manually tested. Extract the matching logic into a `server/utils`
      function (puts it under the 98% gate) or drive the handler via the
      sso-linking integration harness.
- [ ] Mail flows (forgot-password, delete-account confirmation): verified
      once by hand against maildev; nothing repeatable. The sso-linking
      harness pattern fits (pglite + production auth options + fetch-mocked
      SMTP transport, or assert on the `sendMail` calls).
- [ ] Admin SSO routes (register/edit conflict checks, sp-metadata for
      drafts, visibility, unlink-sso, sso-links): thin but admin-facing;
      a handler-level test file with a pglite db would cover the lot.
- [ ] NotificationBell "mark all read on open": only the composable side
      (markAllRead/deleteAll mutations) is covered. The panel `@show` hook
      can't be exercised - PrimeVue's Popover doesn't emit show on a
      programmatic toggle under happy-dom (the existing bell tests never
      open the panel for the same reason). Needs a real-browser/e2e check.

### E2E (Playwright harness `mise run e2e` + the `pnpm e2e:smtp` script)

The Playwright harness now ships predict->finalize->leaderboard, the
password-reset / delete-account mail flows and an SSO/OIDC flow against a
dockerized Keycloak. Its runnability fixes below were found in the
feature-treatment review but could NOT be executed there (no Docker) - run
`mise run e2e` and confirm before ticking:

- [ ] **Seed a default `scoring_config` for the isolated e2e DB**: a fresh,
      migrated e2e DB has no `scoring_config` row (it is only seeded by
      `fixtures:import`/`refresh`), so `matches:finalize` throws "no active scoring
      config" and the predict->finalize->leaderboard spec fails from empty. Seed a
      default config (mirror `ensureDefaultScoringConfig` - it carries the jsonb
      `crowdTiers`/`championTiers`/`oddsTiers`, so an app-side seed-on-boot in
      `warm-settings.ts`, or a run-task, is cleaner than hand-writing the SQL).
- [ ] **Wait for Keycloak readiness in the SSO spec**: `global-setup` polls only
      the app, and `e2e-up` starts Keycloak with `up -d` (returns immediately);
      KC `start-dev --import-realm` takes ~30-60s. The sso `beforeAll` can fire the
      provider-registration POST (which fetches the IdP discovery doc) before KC is
      up - cold-start flake. Poll the issuer's `.well-known/openid-configuration`
      before registering.
- [ ] **e2e helpers default to the dev stack when `E2E_*` is unset**: `helpers/db.ts`
      / maildev / APP fall back to :5432/:1080/:3000. Mitigated by
      `playwright.config.ts` loading `.env.e2e` and by fully namespaced cleanup (no
      catastrophic wipe), but importing the helpers outside Playwright would
      seed/delete `e2e-cup` in the dev DB. Make the helpers refuse to run without
      an explicit e2e target.
- [ ] Identifier-first login: password reveal for local accounts, SSO
      redirect for captured domains, `/login?password=1` escape hatch.
- [ ] Signup domain-capture warning (continue anyway / use SSO).
- [ ] Password-reset mail flow end-to-end (request -> maildev -> reset ->
      sign in with the new password).
- [ ] Delete-account mail flow end-to-end (request -> maildev -> click ->
      account gone).
- [ ] Passkeys (needs a WebAuthn virtual authenticator; Firefox headless
      cannot - either chromium for this one test or skip).
- [ ] Prediction -> finalize -> leaderboard loop through the UI.
- [ ] Live WebSocket updates (crowd totals patch, live score + goal
      celebration).
- [ ] Real OIDC handshake against a disposable IdP (e.g. dockerized
      Keycloak/Authentik) - would also cover account linking and the
      password nuke in a real browser flow.

## Ops

- [x] Nightly backup cron on the host (pre-1.0 checklist):
      `0 4 * * * cd ~/repos/nostragoalus && mise run db-backup`, outdir on
      a different disk than the Postgres volume. (Confirmed 2026-06-13: prod
      has it; the dev host intentionally doesn't.)
- [ ] Worktree previews start without the gitignored `.env` (better-auth
      refuses its default secret, auth 500s): `mise run preview` could copy
      `.env` from the main checkout when missing, or at least fail loudly.

## Image storage (deferred from the feature pass)

- [ ] **Orphan-object GC**: a deleted league cascade-deletes its chat_message /
      chat_attachment rows in the DB, but the storage backend keeps the objects.
      A sweep task could list `chat/*` keys with no row and delete them (also
      cleans objects orphaned by a storage-write that the later tx rolled back -
      keys are deterministic so a retry overwrites, but a permanent rollback
      leaves one).
- [ ] **Takedown deletes the object**: a REMOVED chat image stays in storage
      (just unserved). A true moderation takedown should also delete the object.
- [ ] **Drop the legacy columns**: once `media:migrate-blobs` has run to zero in
      prod, a follow-up migration can drop `chat_attachment.ciphertext` and tighten
      `storage_key` to NOT NULL (the CHECK already enforces exactly-one meanwhile).
- [ ] **Avatar serving**: served behind the app (session-gated). A CDN / public
      cache in front of `/api/media/avatar/*` would offload it (URLs are immutable,
      content-addressed) - left simple for now.
- [ ] **Multi-node backup**: the combined backup mirrors the bucket from one host.
      A multi-instance deploy would want object lifecycle / SSE on the store itself
      rather than a host-local `mc mirror`.

### Deferred from the feature-treatment review

- [ ] **fs-driver media is not in the combined backup**: `db-backup`/`db-restore`
      only mirror the s3/rustfs bucket via `mc`. An `NUXT_STORAGE_DRIVER=fs` deploy
      is told to use `--no-media`, so the files under `NUXT_STORAGE_FS_ROOT` are
      backed up by nothing. Either add an fs-root tar/copy into `media-<stamp>` when
      the driver is fs, or document loudly that fs deployers must back the root up
      themselves. (The shipped Docker stack defaults to s3, which IS covered.)
- [x] **Pin the storage images**: rustfs and minio/mc are now pinned by
      `tag@sha256` to the digests proven in prod (rustfs `1.0.0-beta.8`, mc
      `RELEASE.2025-08-13T08-35-41Z`), so a `docker compose pull` can't swap in a
      breaking backend/mc.
- [ ] **Don't ship usable default object-store creds in prod**: `compose.yaml`
      falls back to `rustfsadmin/rustfsadmin` via `:-`. rustfs has no published
      prod port (in-network only), so the risk is modest, but a hardened deploy
      should require `NUXT_STORAGE_S3_ACCESS_KEY_ID/_SECRET_ACCESS_KEY` (fail loud)
      with the defaults living only in `compose.dev.yaml`.
- [ ] **Backup/restore are not atomic across the two stores**: a live `db-backup`
      can record an attachment row in the dump and then miss its object if the image
      is deleted in the window before `mc mirror` (the inverse of the additions case
      the comment guarantees); and `db-restore` does the destructive `pg_restore
      --clean` before the media mirror, so a media-step failure leaves a fresh DB
      against the old bucket. A pre-flight reachability check on the store + a note
      that the app should be stopped would tighten this.
- [ ] **Signed-out avatars on public pages**: `/api/media/avatar/[key]` is
      `requireUser`-gated, so migrated (formerly inline `data:`) avatars now 404 for
      signed-out viewers of public surfaces (`/leagues/join/*`, `/s/*`); UserAvatar
      degrades to the brand placeholder. Decide whether avatars (content-addressed,
      non-enumerable) should be public to restore the prior behavior.
- [ ] **Storage driver contract tidy-up**: `put`'s `contentType` is a no-op for the
      fs driver (type is derived from the key on read) but load-bearing for s3, and
      `fsDriver.exists` swallows a path-escape `StorageError` into `false` unlike
      get/put/delete. Document the contentType contract and make `exists` consistent.
- [ ] **De-duplicate the chat-image encode/decode**: `putChatImage` takes a
      `Uint8Array` and `getChatImage` returns one, so all four call sites wrap them
      in `TextEncoder`/`TextDecoder` (service.ts x2, migrate.ts, attachments.ts).
      Moving the conversion inside those two helpers (string in/out) collapses it.

## Roadmap / home CTA / PWA (deferred from the feature passes)

- [ ] Roadmap admin reorder is two sequential PUTs from the client (swap with
      the neighbor); one failing leaves duplicate positions. A server-side
      swap/reorder endpoint fixes it and is a prerequisite for the kanban
      drag-and-drop (ROADMAP.md).
- [ ] Roadmap item content is single-language while the chrome around it is
      i18n'd in four locales; decide whether that's accepted (EN-only roadmap)
      or items grow per-locale fields.
- [ ] NextMatchCta duplicates the matches query under its own ['next-match']
      cache key (the landing page has no competition route param) and polls
      every 60s during live matches; the WS patcher only feeds
      ['matches', slug]. Unify the keys or subscribe the CTA to the socket.
- [ ] STATUS_BUCKETS (matches/index.vue) is a third MatchStatus grouping that can
      drift from statusSeverity/matchStatusLabel (format.ts), and isLive is
      hand-redefined in NextMatchCta/map/matches[id] (a 4th, exclusion-based copy
      lives in useLiveMatches). Centralise the status -> bucket/severity/isLive
      facts in one place (format.ts) so they can't diverge.
- [ ] PWA update flow (shipped in 1.5.0): the banner's two paths (build-manifest
      poll, waiting SW + controllerchange reload) were only verifiable by hand
      across local rebuilds - verify across two real prod deploys, and check iOS
      installed-PWA behavior specifically.

## Main page rework (deferred from the feature pass)

- [ ] The cue path (tap to skip the intro) latches the banner slim and lands
      content reliably on every viewport. Manual scrubbing is not as clean on
      very small phones: phase 1 is a fixed 420px, but a short viewport reaches
      the hero before that, so a hand-scroller sees the strip half-shrunk over
      the content between content-arrival and the dock/latch point. Fix is a
      screen-aware phase length (shorten SCRUB/PHASE2 on small viewports) or a
      mobile-simplified banner (static slim band, no scrub). Not worth the extra
      complexity until someone reports it.
- [ ] The intro re-expands only at the very top (scrollY <= 16). If that edge
      ever feels abrupt, widen it into a short easing band instead of a hard
      threshold.

### Deferred from the feature-treatment review

- [ ] Short-page latch edge: `scrollPastIntro` sets `latched=true` then
      `window.scrollTo(target)`, but the slim-bar transforms `t1`/`t2` are
      `useTransform(scrollY, ...)` and only recompute on a scroll change. When the
      target equals the current position (page too short to scroll, hero already
      near top), no scroll fires, so the banner never visually docks despite
      `latched`, and `cueScrolling` never clears (re-expand stays disabled for the
      session). Drive the dock off `latched` directly rather than relying on a
      scroll tick. Extends the short-viewport item above.
- [ ] Extract the inline scroll/latch math from `app/pages/index.vue` (the
      thresholds, latch/unlatch decision, `cueScrolling` guard, reduced-motion
      branch) into `app/utils/landing.ts` so it sits under the 98% gate and is
      testable without a DOM. Today only `pickNextMatch` is extracted; the
      load-bearing latch logic ships untested (a page, outside the gate).
- [ ] `index.vue` registers `scrollY.on('change')` / `t1.on` / `t2.on` in
      `onMounted` but only removes the resize listener in `onBeforeUnmount`.
      motion-v disposes scope-tied subscriptions so it's not a confirmed leak, but
      capture and call the `.on` unsubscribers for symmetry (the repo has a history
      of leaked-observer flakes).
- [ ] Decide the `players` count population: `getPlatformStats` counts all `user`
      rows, including unverified and banned accounts, so the public "N players"
      teaser can exceed the visible player base. Filtering `emailVerified` would
      wrongly zero out everyone when verification is off; excluding `banned` is
      safe if "joined" should mean active accounts. Left as count-all pending a
      product call.
- [ ] Document the new public GET `/api/stats` in the sampled API response
      schemas (`server/utils/docs/response-schemas.json` via
      `scripts/gen-api-schemas.mjs` TARGETS). Deferred with the other endpoints
      pending a controlled regen (sampling rewrites the whole file and pulls live
      drift); the route already carries its inline `defineRouteMeta` OpenAPI.

## Email verification (deferred from the feature-treatment review)

- [ ] The email-verification flag cache (`server/utils/auth/email-verification.ts`)
      is a process-wide module `let cached`; tests rely on a beforeEach re-seed.
      A test that reads `emailVerificationRequiredSync` before seeding could see
      another suite's value (order-dependent flake, the class CLAUDE.md warns of).
      Expose a reset, or make the cache injectable.
- [ ] Verifying via the mailed link lands on `/matches`, dropping any `next` the
      user signed up with (e.g. a league-invite deep link): signup passes
      `callbackURL: '/verify-email'`, so the original `next` isn't carried through
      the verification round-trip. Thread `next` through verify-email.
- [ ] `users:prune-unverified` task doesn't check `cronDisabled` (consistent with
      finalize/fixtures, and self-gated on the verification flag) - if cron is
      disabled to halt jobs, the destructive prune still runs when the flag is on.
      Consider honoring the cron kill-switch for the destructive one.
- [ ] Sign-up enumeration hardening: with verification on, better-auth returns a
      token-less synthetic 200 for existing emails; with the admin + two-factor
      plugins adding user fields, set `customSyntheticUser` so the new-vs-existing
      response shape stays indistinguishable.

## Odds feature (deferred from the merge review)

- [x] Provider switch no longer replays foreign ids: `setCompetitionOddsProvider`
      (1.22.0) clears every match's `oddsEventRef`/`oddsEventSwapped` for the
      competition when the provider actually changes, so the new provider re-maps
      from scratch. Remaining: `closingOddsForOutcome`/`latestOddsByMatch` still
      read snapshots by `matchId` only, not scoped by `oddsSnapshot.provider`, so a
      switch could mix an old provider's historical snapshots into a re-score. Scope
      odds reads by provider (or stamp/clear snapshots on switch) for full safety.
- [ ] The admin odds-provider enum is single-sourced at runtime
      (`ODDS_PROVIDERS`), but the OpenAPI block in `odds/index.put.ts` hand-lists
      `["sofascore","betexplorer"]` and `AdminOddsSection.vue` re-declares the
      payload interfaces (provider typed as plain string) instead of importing the
      shared `OddsProviderKey`/server row types - both can drift. Import the shared
      types and derive the OpenAPI enum.
- [ ] TEAM_NAME_ALIASES is in-code; a DB alias table (or an admin override to
      pin a match's event ref) would fix unmatchable names without a deploy.
- [ ] Extract the provider JSON envelope (rate limit + status mapping + json)
      shared by fifa/uefa/alltime-h2h/sofascore - sofascore is the 4th copy,
      now with extra knobs (403=rate-limit, 404 sentinel, parse-challenge).
- [ ] normalizeTeamName (odds matcher) vs searchable() (app/utils/format)
      duplicate diacritic folding with diverging special cases.
- [ ] RateLimiter.acquire is check-then-sleep; concurrent callers can fire
      together. A promise-chain queue would make the host spacing a guarantee.

## Odds movement / breakdown (deferred from the feature pass)

- [ ] The per-bookmaker breakdown is plumbed end-to-end (store -> payload ->
      `MatchOdds.vue` expand), but no shipping provider populates
      `oddsSnapshot.bookmakers`: Sofascore is a single aggregated feed and stores
      null, so the expand currently only shows the opening prices. A multi-book
      provider (a working BetExplorer fetcher) would light up the breakdown.
- [ ] `MatchOdds.vue` reads opening/bookmakers from the latest snapshot only.
      For a richer movement view it could read the full snapshot series
      (sparkline / open->close timeline) rather than just open-vs-current.

- [x] Dedup the rank-snapshot pair: updateLeagueRankSnapshots/getLeagueRankMovements
      are verbatim copies of the global ones (snapshots.ts) - parameterize by
      table/scope. Same for the per-league fetch pipeline in useCrowdTotals
      (clone of the global block) and adminCreateLeague vs createLeague.
- [ ] Extract one resolveLeagueView(event, leagueId) guard helper - the
      getLeague/membership/admin/canView/competition-slug block is copy-pasted
      across leaderboard, crowd and league-detail routes (already drifted: the
      mutation routes 403 where the GETs 404, leaking league existence).
- [ ] Adopt defineValidatedHandler on the remaining hand-rolled league mutation
      routes - create/join/rename/transfer are converted; `[id]/index.delete`,
      `[id]/join`, `[id]/leave`, `[id]/members/[userId].delete` and
      `[id]/regenerate-code` still aren't - so toHttpError + future hooks apply
      uniformly; the user-facing delete currently 500s on a vanished league.
- [ ] "+N hidden" marker has two derivations that can drift: LeagueCard's roster
      uses `memberCount - members.length` while the leaderboard and league-detail
      pages use the server `hiddenCount` (useLeaderboardHiddenCount /
      countLeagueMembersHiddenFromBoard). Feed both from one source (return
      hiddenCount on the league-detail endpoint too).
- [ ] Public invite-preview route `/api/leagues/invite/[token]` is unthrottled,
      unlike the rate-limited accept/join routes. 96-bit tokens make brute force
      infeasible, but the join-code fallback path is enumerable; IP-key a limiter
      for parity. (Invite management routes also add 3 more copies of the
      getMembership+canManageLeague guard - folds into the resolveLeagueView item.)
- [ ] Share a LeaderboardRows component between /[competition]/leaderboard and
      /leagues/[id] - the league page copy dropped movement arrows + the
      champion crown (a feature gap: per-league movement is computed but unshown).
- [x] Scale: updateLeagueRankSnapshots is leagues x members sequential
      INSERT/UPDATE per finalize tick; getLeaderboard's champion query isn't
      league-scoped (fetches all picks for a 20-row board); publishLeagueCrowd
      fan-out scans all subscribers per league. Batch/scope when league count grows.
- [ ] WS auth is resolved once at socket open; a signed-out/expired session keeps
      its userId for the socket's life. Re-validate periodically or on a sentinel.
- [x] Dead endpoint: GET /api/me/league-prompt + shouldShowLeaguePrompt have no
      caller (the dialog derives visibility client-side); remove or wire up.
- [x] League leaderboard page shows an empty board (not an error) when the
      selected league was deleted/left until useMyLeagues refetches; clear the
      selection on a league fetch 404.
- [ ] Rate limiter is in-process per instance; multi-instance multiplies the
      join-code attempt budget (shared limiter / store needed if scaled out).

## League match standings (deferred from the feature-treatment review)

- [ ] Match Ranking tab (1.24.0): switching the league pill while the tab is open
      shows the previous scope's rows for the in-flight fetch (the skeleton only
      renders when there are no rows). Clear `leagueBoardData` on a `leagueId`
      change so the skeleton shows during the refetch. Cosmetic, sub-second.
- [ ] `getMatchLeagueStandings` re-implements the league roster-with-visibility
      query (server/utils/leaderboard/match.ts) that already lives in
      `listLeagueMembers` (leagues/service.ts) - same private/hidden AND-clause and
      viewer-on-top `or`. Two sources of truth for "who is a visible member": share
      one helper so a visibility-rule change can't drift the per-match board from
      the league page.
- [ ] The "1224" rank-assignment loop in match.ts is a third copy of the inline
      block in `getLeaderboard` (leaderboard/service.ts); `compareLeaderboardRows`
      was extracted but this dense-skip step wasn't. Extract `assignRanks(rows)` so
      a tie-handling change lands once.
- [ ] The league-standings route adds another copy of the getLeague + membership +
      admin guard - folds into the existing `resolveLeagueView(event, leagueId)`
      helper item under the Leagues section.
- [ ] `needsProvisional` is field-global: a finished match recomputes provisionally
      for every member if any one still has null points. Safe today (finalize
      scores all locked picks for a match atomically, so it's all-or-nothing), but
      decouple per-row if partial finalize ever becomes reachable, so persisted
      final points are never overwritten by a recompute.
- [ ] `/api/matches/[id]/league-standings` is left out of the sampled API
      response-schemas (response-schemas.json): it's member/admin-gated and only
      returns rows for a seeded league + live match, so the public docs sampler
      can't reach it. Add it (with seed setup) if we ever document member routes.

## Crowd bot (deferred from the merge review)

- [x] getBotOverview runs on every request with no caching: it scans all
      competition predictions into memory, rebuilds per-match histograms on the
      read path, and re-runs getLeaderboard(limit:10000) for the rank. Identical
      per (competition, league, method) - wrap in a short-TTL cached function,
      or push MODE/MEAN to a SQL GROUP BY and precompute scores at finalize.
- [ ] insertGhostRow appends the bot to the end of a *paginated* board page when
      its rank exceeds the page; fine at friends-scale (<100) but misranks the
      ghost row on a partial page. Insert by rank against the full ordering.
- [ ] Bot rank reimplements the first four levels of compareLeaderboardRows
      inline; build a RankableRow and rank through the shared comparator so the
      ghost row can't drift from the real ladder. The 10000-row cap also
      silently truncates the comparison population.
- [ ] Dedup the bot endpoints' league-guard/competition-resolution preamble
      (resolveBotScope helper) and the client method-toggle + bot badge between
      leaderboard.vue and bot.vue.
- [ ] MEAN rounding uses Math.round (half-up bias on x.5 averages); consider
      banker's rounding or documenting the bias.

## Best scorer (deferred from the merge review)

- [ ] Champion and best-scorer were near-identical clones at every layer. The
      meta-pick refactor shared the read/display/notify plumbing (`useMetaPick`,
      `MetaPickShowcase`, `collectMetaBonus`, `notifyMetaResult`). What remains
      cloned is the stateful write/award core (`setChampionPick`/`setBestScorerPick`
      lock+upsert, `repick*`, and the `awardChampionBonuses`/`awardBestScorerBonuses`
      half-points-on-repick SQL) and the whole-card wrapper - the pending-state
      skeleton is still duplicated byte-for-byte in BestScorerPick/ChampionPick, so
      extract a `<MetaPickCard>` over MetaPickShowcase that owns it. Finish so a
      third bonus is config, not copy-paste. High-churn, touches the working
      champion feature - own focused pass.
- [ ] `notifyMetaResult` takes an optional `collector?: PendingNotification[]`;
      `notifyChampionResult` threads it through but `notifyBestScorerResult` omits
      it (pre-existing asymmetry the shared helper now makes obvious). If a
      batched/live-push path ever drains that collector at finalize, best-scorer
      result notifications write straight through and miss the batch. Thread the
      collector through best-scorer for symmetry, or document why it differs.
- [ ] topScorerPlayerIds drops goals with a null playerId; if a real top
      scorer's goals are partly unattributed the tie can be miscomputed. Picks
      match by playerId so it self-limits, but consider a playerName fallback or
      surfacing unattributed goals.
- [ ] topScorerPlayerIds loads all goal_event rows and counts in JS; a SQL
      GROUP BY/COUNT avoids the in-memory pass (it runs each finalize tick).
- [ ] Picker UI swallows save errors (no onError/toast - mirrors ChampionPick);
      a locked-race 409 or 422 is silent. Add inline error surfacing (and to
      ChampionPick) once there's a toast/error pattern.
- [ ] BestScorerPick watchEffect seeds the selects once (guard === null); a
      slow myPick load after the user touches the team select desyncs the
      dropdowns from the stored pick.
- [ ] The bot has no best-scorer consensus (only champion); consider a
      best-scorer consensus for parity, or document the asymmetry.

## Play-by-play (deferred from the feature-treatment review)

- [ ] timeline.get.ts duplicates live-detail.get.ts wholesale (imports, cache
      shape/TTL, the match-row select, the getCompetitionById ->
      resolveCompetitionSeason -> providerForCompetition ladder). Extract a
      shared resolveMatchProvider(id) (or a withMatchProviderCache helper) so
      the two endpoints collapse to their unique provider call and can't drift.
- [ ] TIMELINE_ICONS / GOAL_KINDS in matches/[id].vue hand-mirror the server's
      TimelineEventKind union and FIFA_EVENT_KINDS goal set; a new/renamed kind
      silently falls back to the bullet and (for goals) loses bold + the score
      column. Share the kind list / goal-kind set from shared types.
- [ ] (i18n pass) PBP_PLAYER_KEYS / KIND_LABEL_KEYS / PERIOD_KEYS in
      matches/[id].vue are hand-maintained kebab->camel identity maps that can
      drift (a kind added to KIND_LABEL_KEYS but missing from PBP_PLAYER_KEYS
      silently renders the nameless fallback). Derive the camel key from the kind
      instead of three lookup tables. Also: getMatchTimeline overloads `language`
      as both the fetch param and the VAR-text gate - a caller passing a
      feed-unsupported language would surface un-localized VAR text; the
      en/fr allowlist lives only in the endpoint. Consider an explicit
      { language, localizeText } or moving the allowlist into the provider.
- [ ] (UEFA) VAR decision text is English-only: UEFA's events feed does not
      localize freeText (verified - `&language=fr`/`&lang=fr` return identical
      English), so fr/th/tlh fall back to the generic "VAR" label while en shows
      the decision. Revisit if UEFA localizes it, or translate the common
      decision phrases ourselves.
- [ ] (UEFA) normalizeUefaTimeline drops free-kicks, corners, saves, offsides
      and the bare VAR review-step markers (no TimelineEventKind for them). Add
      'corner'/'save' kinds (icons + i18n) if wanted, and fold the VAR markers
      into the decision line rather than dropping them.
- [ ] (UEFA) getMatchTimeline re-fetches /events even though the route already
      pulled the same feed via getMatchDetail; thread the events through (or
      cache them) to avoid the double fetch.
- [ ] normalizeUefaTimeline (uefa.ts) and normalizeFifaTimeline (fifa.ts) are now
      two implementations of the same TimelineEvent contract (FIFA table-driven,
      UEFA a hand-rolled switch). The cross-cutting rules - own-goal side flip,
      VAR-text language gate, the trailing reverse-to-newest-first, drop-unmapped-
      period - are encoded twice and can drift. Extract a shared buildTimelineEvent
      + the policy helpers; keep the per-provider kind tables. Caveat for the
      extractor: UEFA derives the running score and second-yellow locally (its feed
      stamps only the final score), where FIFA reads them off the feed - the seam
      needs a per-event derivation hook, not a 1:1 merge.

## Admin panel redesign (deferred from the feature-treatment review)

- [ ] Sections render with `v-show`, so all of them mount on `/admin` load and
      every section's query fires eagerly (enabled: isAdmin) - including the now
      folded-in `/api/admin/cron`, which used to fetch only when you visited
      `/admin/cron`. Gate each section's fetch on being the active section (or
      lazy-mount the hidden ones) so opening the default section doesn't fan out
      6+ admin round-trips. AdminCronSection's 30s `useTimestamp` tick also runs
      for the whole admin session even while hidden.
- [ ] AdminCronSection uses `useFetch(..., { immediate: props.isAdmin })` - read
      once, non-reactive, unlike the sibling sections' `enabled: computed(() =>
      props.isAdmin)`. Fine today (parent awaits isAdmin before render) but
      fragile to render-order changes; make it reactive for consistency.
- [ ] The rail count badges use a `counts: Record<string, {total,loading}>`
      keyed by nav key (only users/leagues populated); a key typo silently drops
      a badge with no type error. Put total/loading on the navItems entries
      instead. Also: the leagues badge total comes from a separate
      ['admin-leagues','options'] query while AdminLeaguesSection runs its own
      ['admin-leagues', slug] query - two fetches of /api/admin/leagues that can
      diverge/stale after a create-delete if only one key is invalidated.


## Done (post-merge correctness pass)

- [x] WS auto-reconnect with backoff + re-subscribe/refetch on reconnect
      (shared useReconnectingSocket; live scores + crowd no longer freeze after
      a deploy/restart). [partial on the bot perf item: TTL cache added; SQL
      GROUP BY aggregation + the 10000-row rank cap still open.]

## Second chance (deferred from the feature pass)

- [ ] (feature-treatment) The `/api/champion` doc schema (server/utils/docs/
      response-schemas.json) is stale: the GET now returns `secondChance` and
      `myPick.repicked`/`original*`, not yet reflected. A bulk `node
      scripts/gen-api-schemas.mjs` also rewrites ~15 other endpoints' example
      values from current live data (drift), so do a controlled regen on a
      stable dataset (or patch just the champion block) rather than bundling the
      churn.

- [ ] The re-pick window is defined on `round_kind` (last GROUP_MATCHDAY round
      kickoff -> first KNOCKOUT kickoff). This assumes a future esports importer
      maps Swiss/group stages to GROUP_MATCHDAY and the playoff bracket to
      KNOCKOUT. If esports rounds get their own `round_kind`, revisit
      `getSecondChanceWindow`. Also: Play-Ins would shift the champion-pick
      *lock* (first kickoff) - separate decision when esports lands. And
      best-scorer (Golden Boot) has no esports equivalent, so the second chance
      there is football-only until an MVP-style meta-pick exists.
- [ ] (feature-treatment review) Pick targets aren't validated against the
      competition: champion `teamCode` and best-scorer `playerId`/`teamCode` are
      only length-checked (zod), never cross-checked against listCompetitionTeams
      / the squad, on both the set and repick paths. Low risk today (an unknown
      code never matches a winner, and the eventual top scorer isn't known at
      pick time), but validating against the real teams/squad would reject junk
      picks. Pre-existing on the base set paths; the repick paths inherit it.
- [x] setChampionPick now upserts (onConflictDoUpdate), race-safe like
      setBestScorerPick and both repick paths. Remaining (low): the repick
      update-branch original* snapshot is still a non-atomic read-modify-write -
      harmless today since concurrent first-switches write the same original.
- [x] getSecondChanceWindow now warns when end <= start (inverted window from
      bad fixture data); isSecondChanceOpen already returns false, so the feature
      no longer disables itself silently.
- [x] (partial) The half-points rule is now one helper (`halvePickPoints` in
      app/utils/format) behind both pickers' worth display, and both halve a
      *previewed* pick during the window - champion's late-first-pick preview no
      longer shows full worth while the server halves it. Remaining: the deeper
      meta-pick generalization (repickChampion == repickBestScorer, the
      secondChance GET shape + repick PUT dispatch, and the two award-SQL forms)
      folds into the "Best scorer" meta-pick item above.

## Champion tiers (deferred from the merge review)

- [x] ~~Pre-feature champion picks backfilled to potential_points=10~~ Moot
      since 2026-06-11: champion picks locked at the first WC kickoff with the
      legacy +10 values in place - no re-snapshot is possible anymore. Lesson
      for the next competition: re-snapshot legacy picks before lock.
- [ ] FIFA rank cache is per-process with a 12h TTL: across a FIFA publication
      boundary (or multiple server instances) two users can snapshot different
      ranks for the same team. Bound max staleness / invalidate on publication
      if it matters.
- [ ] ChampionPick: a saved pick shows its locked snapshot worth while the
      dropdown/team list shows the live tier - the same team can display two
      worths after ranks move. Label the snapshot ("locked") to disambiguate.
- [ ] Bot champion payout is the mode of pickers' snapshots (ties low) and is
      dragged by backfilled-10 legacy picks; revisit if the bot's champion
      points look off.
- [ ] Extract the shared provider getJson envelope (rate-limit + 429/403 +
      json-guard) now duplicated across fifa, sofascore and fifa-ranking; and a
      generic ordered-tier resolver for crowd/odds/champion tiers.

## Match watch links (deferred from the feature pass)

### Deferred from the feature-treatment review (feat/match-view-streams)

- [ ] Embed sandbox is an admin-trusted footgun: per the force-embed design, an
      admin (or a leaked `media:write` API key) can force-embed an arbitrary
      non-whitelisted https host on the public match page with `sandbox=false`
      (no sandbox attribute) or `sandbox=true` (grants `allow-same-origin` even to
      an untrusted host, the documented sandbox-escape combo). Intended capability
      and within the admin trust boundary, but the blast radius is every
      unauthenticated viewer. Harden later: scope `allow-same-origin` to
      whitelisted providers only, and/or keep `sandbox=false` to whitelisted
      hosts. Protect the `media:write` key accordingly. (resolveEmbedAttrs in
      shared/match-media.ts.)

- [x] Machine auth (built on feat/api-keys): @better-auth/api-key plugin (suite
      bumped 1.6.14 -> 1.6.18; apikey table hand-authored in auth-schema since no
      CLI was available, proven by an integration test). `defineValidatedHandler`
      accepts `apiKey:{resource:[perms]}` - an x-api-key is verified, the owner
      loaded, and required to be an admin for admin routes; session guards strip
      x-api-key so a key never implicitly resolves a session. The media write
      routes now opt into `apiKey:{media:['write']}` (shipped with feat/match-media
      in 1.19.0), so the curation bot can POST/DELETE links with its scoped key.
- [x] Admin API-client UI (feat/api-keys, rebuilt in feature-treatment): admin-page
      section to mint scoped/expiring keys (plaintext shown once), list and revoke.
      Minting goes through admin-gated server routes (`/api/admin/api-keys`) that mint
      in server context via `mintApiKey`, NOT the better-auth plugin's client
      endpoints - the plugin 400s on a client-set scope (SERVER_ONLY_PROPERTY) and
      its create/list/delete are session-only (any user, own keys), so the original
      client-direct UI was both broken and not an admin boundary. NOT yet 2FA-gated
      for the mint action - revisit if minting needs step-up auth.
- [ ] Curation bot (separate repo, keeps grey-zone sourcing out of this app):
      cron reads `/api/matches` for fixtures in the next N hours, finds links,
      POSTs them near kickoff (header-check X-Frame-Options before setting
      embeddable=true); after FINISHED, finds replay/highlights (more often on
      whitelisted/legit hosts) and clears dead LIVE links.
- [ ] No edit endpoint: media edits are delete + re-add. Add a PUT only if
      inline relabel/retarget becomes worth the surface.
- [x] `embedSrcFor` force-embed of a non-whitelist host (raw URL): hardened in the
      1.19.0 feature-treatment. `embedTargetFor` now returns `{src, trusted}`; a
      forced raw host renders in a STRICT sandbox (no `allow-same-origin`, no
      top-navigation) so it can't escape the frame or framebust, while recognised
      providers keep the player sandbox. Non-whitelist still opens in a new tab
      unless an admin explicitly force-embeds.

### Deferred from the feature-treatment review

- [ ] The public GET `/api/matches/[id]/media` is not in the sampled API response
      schemas (`response-schemas.json`); add it on the next controlled regen (its
      inline `defineRouteMeta` OpenAPI already ships). It also returns `{media:[]}`
      (200, not 404) for an unknown/garbage match id - intentional public-read
      contract; add a zod-uuid guard only if a 400 is wanted.
- [ ] `visibleMediaForStatus` is yet another bespoke MatchStatus grouping (now
      handles FINISHED+AWARDED) - folds into the existing "centralise status ->
      bucket/severity/isLive in format.ts" item under Roadmap/home CTA above.

## SSO / better-auth 1.6.18 (deferred from the api-keys upgrade)

- [ ] SSO domain ownership verification (DNS TXT): deliberately NOT added. SSO
      providers are registered by site admins only, so domain-ownership proof
      would gate an actor who's already fully trusted (single-tenant model) - it
      buys nothing today. The plugin ships the primitives (domainVerification
      token endpoint + verify flow). Add only if provider registration is ever
      delegated to a less-trusted role or the app goes multi-tenant; then make
      new providers start domainVerified=false and grandfather existing ones
      (already default true). Cheaper interim guard against accidental capture
      (admin fat-fingers a public domain): warn/block well-known freemail
      domains (gmail.com, outlook.com, ...) at registration.
- [x] History: the trust-email_verified commit was superseded by the
      domainVerified one. Shipped UNSQUASHED in the feature-treatment merge -
      interactive rebase isn't available in this environment and the two are
      non-adjacent. The net code is correct (domainVerified-based); only the
      history carries the flip-flop. Not worth a force-push rewrite now.

### Deferred from the feature-treatment review

- [ ] `@better-auth/api-key` is pinned to an exact `"1.6.18"` while `better-auth`,
      `@better-auth/passkey` and `@better-auth/sso` use `"^1.6.18"`. Today all
      resolve to 1.6.18, but a future `pnpm update` could float the others ahead
      while api-key stays frozen. Align the range (via pnpm) on the next bump.
- [ ] Minted keys set `rateLimitEnabled: false`, so there is no per-key
      verification throttle (the plugin's default would be 10/24h). Fine given the
      48-byte key entropy; revisit if a public route ever consumes keys.
- [x] The consume side (`requireApiKey` + the `apiKey:` option on
      `defineValidatedHandler`) now has its first live consumers: the media
      write routes opt into `apiKey:{media:['write']}` (1.19.0). The
      owner-must-be-admin enforcement is unit-tested; a real end-to-end run with
      an actual minted key + the curation bot is still worth doing once the bot exists.

## Scoring config (deferred from the feature pass)

- [ ] The result-rarity layer is folded into `prediction.bonusPoints` (no
      schema change). If the UI ever needs to show the two layers separately
      (exact-rarity vs result-rarity), persist the split - add a column rather
      than re-deriving at read time.
- [ ] A scoring save recomputes prediction points + rank snapshots, but
      champion and best-scorer bonuses are pick-time snapshots and are NOT
      retroactively re-valued by a config edit (changing `championTiers` /
      `bestScorerBonus` only affects future picks / the next finalize award).
      Decide if a config edit should also re-award those, or document it as
      intended.
- [ ] Existing installs get `crowd_outcome_tiers` = null on migration (layer
      off); only fresh installs ship it on. There is no UI hint that the
      default has the layer off - the admin discovers it by opening the page.
      Consider a one-time "new: result-rarity layer" nudge, or a backfill if we
      decide every deployment should get it.
- [ ] No optimistic-lock / version check on the admin save: two admins editing
      the same scope concurrently last-write-wins (each bumps the global
      version, so no data corruption, just a lost edit). Add an "expected
      version" guard if it ever matters.
- [ ] `recomputeCompetition` rescores serially per match inside the save
      transaction. Fine for a tournament's match count; if a competition grows
      large, batch the prediction updates or move the recompute off the request
      path (job + progress).

### Deferred from the feature-treatment review

- [ ] The rules->row WRITE mapping has two copies: `rowValuesFromRules`
      (admin.ts) and the inline insert in `ensureDefaultScoringConfig`
      (store.ts). They must stay identical; adding a scoring column means editing
      both plus `rulesFromConfigRow` (config.ts). Extract one `rulesToRowValues`
      helper beside `rulesFromConfigRow` and use it in both - else the seeded
      default can silently drop a new column while overrides carry it.
- [ ] `championPointsForRank` (config.ts) added a third hand-rolled copy of the
      ordered-tier resolver (alongside `crowdBonus`/`oddsBonus`). Folds into the
      already-listed generic ordered-tier resolver item above - boundary
      comparisons differ (`<` vs `<=`) so they can drift.
- [ ] `AdminScoringSection.vue` redeclares `CrowdTier`/`OddsTier`/`ChampionTier`
      and a local `Rules` interface already exported as `ScoringRules` from
      `shared/types/scoring.ts`, and hard-codes default tier literals from
      config.ts. Import the shared types so a server-side shape change is caught
      by the compiler instead of silently dropping a field on save.
- [ ] `ScoringContext` (finalize.ts) is structurally identical to
      `ActiveScoringConfig` (store.ts) (`{ version, rules }`); admin.ts passes an
      `ActiveScoringConfig` where a `ScoringContext` is expected and it only
      type-checks by coincidence. Share one type.
- [ ] On a DEFAULT-config save, `recomputeCompetition` re-resolves
      `getScoringConfigFor` once per competition inside the transaction even
      though they all use the just-saved default. Pass the resolved default down
      to avoid N config SELECTs (lock-hold time on large competition sets).
- [ ] Empty tier arrays are accepted by the zod schema (length now capped at 50,
      but `.min` is 0): an empty `crowdTiers` silently disables the crowd bonus
      with no error. Either require `.min(1)` or document "empty = layer off".
- [ ] The admin scoring mutations (PUT/DELETE) trigger a full recompute and have
      no rate limit. Admin-only and transactional, so blast radius is a
      self-inflicted DB load spike - revisit only if it bites.

## Notification center (deferred from the feature pass)

- [ ] SSO auto-join emits no LEAGUE_JOIN: the admin "apply now" back-fill
      (`applyAllProviderAutoJoins`) calls `autoJoinSsoLeagues` for every matching
      user, so emitting there would mass-notify owners. Wire a join notification
      at the per-login call site only (the SSO provisionUser hook, using the
      returned joined ids), not inside `autoJoinSsoLeagues`, so the back-fill
      stays silent.
- [ ] Result notifications only celebrate winners. A "your champion / Golden Boot
      didn't win" closure to the (many) losers is intentionally skipped for v1 -
      the `championLost` / `bestScorerLost` i18n strings and the `won:false`
      branch already exist; decide whether the closure is worth the volume.
- [x] Retention: the `notifications:prune` task (daily) drops read notifications
      older than 7 days and caps each user to the newest 200; users can also
      dismiss any notification individually (delete button, `POST
      /api/notifications/delete`). PICK_REMINDER keeps its own self-prune.
- [ ] The bell loads the newest 30 with no "load more" wired (the `before`
      cursor exists in the service/API but the UI doesn't page), while
      `countUnread` counts ALL unread - so >30 unread shows a badge larger than
      the visible list until mark-all-read. Wire pagination or cap the badge.
- [ ] "Clear all" is supported server-side (`POST /api/notifications/delete`
      `{all:true}` -> `deleteAllNotifications`) but the bell only wires per-item
      dismiss; add a clear-all control if wanted.
- [ ] Goal-on-a-predicted-match alerts are deferred to the web-push feature (a
      push payload, scheduled and higher volume); slots in as a new
      `notification_type`. (MATCH_RESULT and PICK_REMINDER now ship in-app -
      pick-lockout reminders via the `notifications:pick-reminders` task, per match
      to active predictors only, self-pruning at kickoff and on pick. A coarser
      per-round digest could replace the per-match reminder/result volume later if
      it proves noisy at scale; the same data can also be re-used as web-push.)
- [ ] PICK_REMINDER prune is eventual: `pruneStartedReminders` runs on the
      `*/15` task cron and on prediction-save, so a stale reminder can linger up to
      ~15 min after kickoff before the sweep removes it (and the client only drops
      it on the next notifications refetch, since there's no `notification:removed`
      WS event). Tighten with a removal push or a finalize-time prune if it bites.
- [ ] The pick-reminder lead time (`REMINDER_LEAD_MS`, 3h) and the task cadence
      (`*/15`) are hard-coded. Make them config/per-competition if tournaments
      with very different kickoff spacing (esports, club comps) need it.
- [ ] `useNotifications` opens its own `useReconnectingSocket` (like
      `useLiveMatches` / `useCrowdTotals`), so a logged-in page holds several WS
      connections. Unify the consumers onto one shared socket if the count bites.
- [ ] `publishUserNotification` (hub.ts) has no unit test for its send branch -
      consistent with the other publishers, but the WS fan-out is now load-bearing
      for the bell; cover it if hub gets a test file.
- [ ] `GET /api/notifications` and `POST /api/notifications/read` are not in the
      sampled API response schemas (`response-schemas.json`); add them on the next
      controlled regen (both inline `defineRouteMeta` OpenAPI already ship).

### Deferred from the feature-treatment review

- [ ] Stale result on correction: MATCH_RESULT / CHAMPION_RESULT / BEST_SCORER_RESULT
      dedupe on a per-event key with `onConflictDoNothing`, so a later score
      correction or rescore does NOT refresh the stored scoreline/points - the bell
      keeps the first (now-stale) figure while the board shows truth. Point-in-time
      by design for v1; a refresh-on-correction would need an upsert keyed on
      `dedupeKey` (and probably a "corrected" cue), weighed against re-pinging users.
- [ ] Best-scorer transient winner: `awardBestScorerBonuses` is gated on a decided
      FINAL and runs after the detail sync, so the Golden Boot is effectively settled
      - but if `goal_event` for the final lags the same tick that settles it, a
      transient leader can be crowned and the per-user `best-scorer-result:<comp>`
      dedupe freezes that notification (a later re-award fixes the points but never
      the notification). Acceptable given the ordering; harden by re-notifying when
      the winner set changes (ties into the stale-on-correction item).
- [ ] `listNotifications` orders by `createdAt desc` only, and `createdAt` is
      `defaultNow()` = the transaction-start time, so every notification minted in
      one finalize tick shares an identical timestamp. The `before` pagination cursor
      (`lt(createdAt, …)`) at such a tie boundary can skip or repeat rows. Add `id`
      as a stable secondary sort and make the cursor composite (createdAt, id).
- [ ] The finalize task swallows `awardBestScorerBonuses` errors ("never fail the
      task over the best-scorer award") with no log, so a best-scorer award OR its
      notification write failing is invisible. Log the swallowed error at least
      (mirrors the snapshot try/catch right below it).
- [ ] `notifyChampionResult` and `notifyBestScorerResult` are near-identical
      (per-competition dedupe, winners select, `won:true` loop) - folds into the
      meta-pick generalization already tracked under "Best scorer".

## Group standings (deferred from the feature-treatment review)

- [ ] The flag + team-link cell in `StandingsTable.vue` (NuxtLink-or-span + a
      `flagUrl()` `<img>`) is hand-copied across the codebase: `matches/[id].vue`,
      `BestScorerPick.vue`, `ChampionPick.vue` and now StandingsTable. `flagUrl` is
      the only shared piece; extract a `TeamCell`/`TeamLink` component so a change
      to team-page routing or flag rendering lands once. Cross-cutting (touches the
      working pick cards), so do it as its own focused pass. (Also: `flagUrl` is
      called twice per row - `v-if` then `:src` - a `TeamCell` would compute it once.)
- [ ] `server/api/competitions/standings.get.ts`'s group-match projection (select
      group/teams/codes/status/full-time, `stage = 'GROUP'`) near-duplicates the
      per-group fetch in the insights service. Extract a shared
      `selectGroupStandingsRows(db, competitionId, groupName?)` in `stats/standings.ts`
      so the column list / `StandingsInputMatch` contract lives once and the
      match-detail table can't drift from the fixtures-page table.
- [ ] The public GET `/api/competitions/standings` is not in the sampled API
      response schemas (`response-schemas.json`); add it on the next controlled
      regen (its inline `defineRouteMeta` OpenAPI already ships). An unknown
      competition returns `{groups:[]}` (200, not 404) - intentional, like the
      sibling competition GETs.

## Web push (deferred from the feature-treatment review)

- [ ] Goal push has no event-level dedup: `notifyLiveMatchEvents` fires on any
      increase in the summed live score between polls (`live.ts`). A provider score
      correction (VAR award, an under-report then correction) can send a phantom or
      duplicate GOAL push, which is non-revocable on the device. Track pushed goal
      events (or last-pushed score per match) for true per-goal dedup.
- [ ] Commit-then-push is not atomic in the live poll path: the score upsert
      commits, then the push is sent (poll.ts). If the task crashes mid-send, the
      next poll sees no delta and never re-pushes - the remaining predictors silently
      miss that goal alert. Best-effort by design; add a replay/outbox if it matters.
- [ ] Subscription endpoint upsert reassigns owner+keys to the caller
      (`push/service.ts` onConflictDoUpdate on the unique endpoint). This is the
      standard "device moved to another account" behaviour and is tested, but an
      authenticated user who learns another user's endpoint URL could hijack the row
      (silence the victim, redirect their pushes). Consider rejecting an endpoint
      already owned by a different user, weighed against the legit shared-device case.
- [ ] Per-category push prefs are account-wide, but the master subscribe toggle is
      per-device, and the prefs copy ("enable push on this device") doesn't convey
      that a category switch affects every device. Clarify the wording (4 locales).
- [ ] `push/content.ts` re-derives the per-type title/body/url that the bell's
      `NotificationBell.vue` itemText/linkFor already encode (drift risk: a new type
      or a changed deep link must be edited in both). Share one `type -> {url, key}`
      mapping between the bell and push.
- [ ] The finalize post-commit flush (`finalize.ts`) and `createNotification`'s
      non-collector branch (`notifications/service.ts`) both hand-pair
      `publishUserNotification` + `pushNotification`. Extract one "deliver a
      PendingNotification across channels" helper so a future channel can't be added
      to one path and missed in the other. Also: nothing enforces that an in-tx
      `createNotification` caller passes a collector - a future one that forgets
      re-introduces the phantom-push-on-rollback bug the collector pattern prevents.
- [ ] The post-commit flush fires one un-awaited `pushNotification` per pending
      notification with no concurrency bound; a popular match's finalize can spawn
      hundreds of concurrent push lookups (2 queries each). Bound the fan-out.
- [ ] Minor push behaviours to revisit: a goal scored in the same poll that flips to
      FINISHED gets no GOAL push (LIVE_STATUSES excludes FINISHED; MATCH_RESULT
      covers it); the `match:<id>` notification tag collapses successive goals + the
      result into one (only the latest shows); `preferences.vue` re-lists the 6 push
      defaults instead of importing `PUSH_DEFAULTS`/`PUSH_COLUMN` (move them to a
      shared module); `send.ts` reads VAPID from `process.env` while the client reads
      `runtimeConfig` (deployer must set the `NUXT_*` env vars, not a non-env
      override); and the `MatchTransition` payload fields built in `upsert-matches.ts`
      have no direct assertion (a scoreline/team field swap would ship green).

## Match reactions (deferred from the feature pass)

- [ ] The reaction bar's visibility gate is status-based (`hasStarted` =
      LIVE/PAUSED/FINISHED) while the server gate is time-based
      (`now >= kickoffTime`). They can disagree briefly when a kicked-off match
      still reads SCHEDULED (provider lag): the bar stays hidden though the API
      would accept a reaction. Conservative and harmless, but the two gates
      should share one source of truth.
- [ ] Reaction counts update only via the WS push (the actor sees their own
      count move a beat after the optimistic highlight). Fine on a live socket;
      on a dropped/slow connection the count lags until the next refetch. A
      local optimistic count patch (decrement old emoji, increment new) would
      close the gap.
- [ ] The two GET routes (`/api/reactions/[matchId]` global + `?league=`) are
      not in the sampled API response schemas (`response-schemas.json`); add
      them on the next controlled regen (the inline `defineRouteMeta` OpenAPI
      already ships).
- [ ] No "who reacted" breakdown or per-reaction list - aggregate counts only.
      Revisit if leagues ask for it (pairs naturally with the trash-talk-threads
      roadmap item).
- [ ] Reactions deliberately raise no notifications (too noisy). Revisit only if
      a digest-style "your match got N reactions" surface is wanted.

### Deferred from the feature-treatment review

- [ ] Reactions mirror the crowd-totals stack almost verbatim: `live/league-reactions.ts`
      clones `live/league-crowd.ts`, `hub.ts` `publishReactionUpdate`/`publishLeagueReactionUpdate`
      clone `publishCrowdUpdate`/`publishLeagueCrowdUpdate`, `useMatchReactions` clones
      `useCrowdTotals`, and `app/utils/reaction-patch.ts` clones `crowd-patch.ts`. The
      privacy-critical league member-gate fan-out is now written 3+ times - a tightening
      in one publisher could be missed in the other. Extract shared primitives (a generic
      `publishLeagueAggregateUpdates(getTotals, publish)`, a `fanOut(memberIds, makePayload)`
      hub helper, a two-scope live-counts composable, a parameterised `patchScope`). Touches
      the working crowd code, so do it as its own focused pass.
- [ ] `publishReactionUpdate` broadcasts the global frame to every subscriber (no
      `sub.matchIds` filter, like `publishCrowdUpdate`); correct (client drops non-matching
      frames) but chatty at scale - gate on the watched match if it bites.
- [ ] The per-league reaction fan-out is fire-and-forget with a fully silent
      `.catch(() => {})` (reactions/index.put.ts); a broken `listCoMemberIdsByLeague` would
      stop live league counts with no signal. Log the swallowed error at least.

## Changelog since-last-seen (deferred from the feature-treatment review)

- [ ] A signed-in user landing directly on `/about` with no marker yet triggers
      two `updateUser` PATCHes for the same `lastSeenChangelogVersion=latest`:
      the layout's `ensureBaseline` and the about page's `markSeen` both fire on
      that tick. Idempotent (identical value, `persist` swallows errors), so
      harmless today, but two uncoordinated writers for one logical "mark seen".
      Collapse if the marker ever becomes non-idempotent (e.g. a seen-versions
      list or a server-side don't-move-backwards check).
- [ ] `lastSeenChangelogVersion` is a user-writable better-auth additionalField
      (`updateUser`, no `input: false`) backed by a plain `text` column with no
      length cap or format guard. Self-scoped and never rendered (consumed only
      by `compareVersions`/`isUnseen`), so not exploitable, but a user could bloat
      their own session/row with a multi-MB string. Add a `maxLength`/format
      normalize in a `before` hook mirroring the `skin` field if it ever matters.

## Tamper-evident scores / commit-reveal (deferred from the feature pass)

- [ ] **Champion + best-scorer picks** have no commitments yet - phase 1 scoped
      to score predictions only. Same ledger pattern fits both write paths
      (`server/utils/champion`/`best-scorer` upserts); add when picked up.
- [ ] **External anchor for the chain head.** In-DB-only anchoring means a full
      DB+app-control operator could rewrite the entire chain and serve a clean
      head; only an observer who snapshotted an earlier head detects it. The
      localStorage witness now makes every visitor such an observer for their OWN
      device, but anchor the head off-box (OpenTimestamps/Bitcoin, or a public
      gist/social post via cron) to make a rewrite detectable by anyone, anytime.
- [ ] **Split-view / equivocation detection.** The localStorage witness proves
      per-device continuity but can't catch a server serving fork A to one user
      and fork B to another (each fork is internally consistent). Needs
      cross-client head gossip - e.g. an endpoint where clients submit the head
      they pinned and get told if it diverges from others', or fold it into the
      external anchor above. Until then, equivocation is the named residual risk.
- [ ] **Chain-head write contention.** `appendPredictionCommitment` locks the
      singleton `commitment_chain_head` FOR UPDATE, so every pick save serializes
      through one row. Fine at WC single-instance scale; revisit before any
      multi-instance deploy or high write burst (sharded sub-chains + a periodic
      Merkle roll-up is the escape hatch).
- [x] **Cold-start seq race** (fixed in review). `appendPredictionCommitment` now
      seeds the singleton head row with `onConflictDoNothing` before the FOR
      UPDATE select, so two concurrent genesis saves serialize on the insert
      conflict instead of both claiming seq=1 and one 500ing. No migration seed
      needed, so schema changes stay generator-only.
- [ ] **Ledger <-> live prediction binding.** The ledger seals pick changes made
      through `upsertPrediction`, but `/verify` reads scores from the
      `prediction_commitment` rows, never cross-checked against the live
      `prediction` table that scoring uses. A malicious admin doing a raw
      `UPDATE prediction SET ...` changes points while the chain still verifies
      "intact" (the original pick stays sealed, so the evidence is preserved, but
      nothing auto-flags the divergence). Close it with a DB trigger that appends
      a commitment on any prediction write, or a periodic job that diffs the
      live table against the latest sealed opening and raises an alert.
- [ ] **Subject pseudonym hardening.** `computeSubject` is an unkeyed
      `sha256('ngc-subject-v1:' + userId)`. userIds are `randomUUID` (not
      enumerable), so mass de-anon isn't feasible, but anyone who learns a
      specific userId can confirm that account's whole pick history off the public
      ledger. A server-only HMAC pepper (never shipped to the browser) folded into
      the subject would make it a true one-way blind - the browser verifier takes
      `subject` as given, so this doesn't break public verification. Costs a new
      secret in the deploy contract, hence deferred.
- [ ] **Canonical hash serialization.** `computeCommitment` / `computeEntryHash`
      join fields with `':'` and no length-prefix/escaping. Safe today (matchId is
      a uuid, subject/salt are hex), but a field that could contain `':'` would
      make two distinct openings collide on one preimage. Switch to a
      length-prefixed or fixed-key-order JSON encoding if a free-form field ever
      enters the hash input.
- [ ] **Rate-limit the public ledger endpoints.** `/api/commitments` and
      `/api/commitments/head` are intentionally public and per-request bounded
      (limit hard-capped to 1000, indexed `seq > afterSeq`), but unlike
      `leagues/join` they have no `createRateLimiter`, so the whole ledger is
      cheap to scrape/hammer repeatedly. Add a light limiter if abuse shows up.
- [ ] **Witness/paginator composable coverage.** `useTamperWatch` and
      `useCommitments` (fetch plumbing + the read-skew-safe paged-head walk) have
      no unit tests - the gated crypto core (`shared/commitment.ts`,
      `witnessExtension`/`verifyLedger`) is fully covered, but the client wiring
      and the snapshot-consistency fix are only exercised end-to-end. The
      concurrency that the read-skew fix guards can't be reproduced on pglite
      (single connection, serial), so the serialization + snapshot guarantees have
      no automated test against real Postgres. Cover with an integration/e2e pass.
- [ ] **Match-card badge.** `/verify` ships, but locked matches don't yet surface
      a "tamper-evident" badge linking to it. Add once the verify story is proven.
- [ ] **Ledger growth + full-chain client verify.** Append-only by design (no
      pruning); autosave is de-duped to actual value changes, but heavy re-picking
      still grows it unbounded, and `/verify` downloads the whole chain (paged
      1000) to verify. Add checkpoint heads / incremental verification if the
      table gets large.

## Themed error pages (deferred from the feature-treatment review)

- [ ] TeapotAnimation reduced-motion fallback positions the football via CSS
      Motion Path (`offset-distance`); on browsers without SVG `offset-path`
      support the ball renders at the SVG origin (top-left) instead of mid-pour.
      Cosmetic, reduced-motion + old-browser only. Give the static pose a plain
      transform fallback.
- [ ] `/418` and `/500` are real, public, deliberately-failing routes with no
      `noindex`/dev guard. Intended (changelog documents them as on-demand
      triggers) and the error status mitigates indexing, but add a route-level
      noindex if crawler exposure ever matters.
- [ ] error.vue recomputes its copy from the status code, so the `statusMessage`
      that 418.vue/500.vue pass into `createError` is dead for those codes.
      Harmless but redundant wiring; drop it or wire it through. Also: the goal
      animation reads reduced-motion via VueUse while the new SVGs use a CSS
      `@media` query - they agree now but could drift if detection changes.

## Timeline break-sub placement (deferred from the feature-treatment review)

- [ ] The FIFA provider's own `substitutions` sort (`minuteValue` in
      stats/insights.ts) sends both break-sub minutes (`''` half-time and the
      `'ET'` sentinel) to the end of the array, while the client re-sorts with
      `app/utils/match-view.ts minuteVal` (which slots them at 45/105). Today only
      `buildTimeline` consumes the array (it rebuilds), so it's correct - but the
      two orderings disagree and only the client one understands the sentinel. A
      future consumer reading `MatchDetail.substitutions` in server order would
      re-introduce the misplacement. Align the two minute-orderings (teach the
      server sort about ''/'ET', or share one comparator).
- [ ] Break-sub half-time-vs-extra-time classification is a positional heuristic
      (FIFA gives no clock at breaks): a team's first sub at HT whose next timed
      sub is in extra time is misread as the ET interval, and a lone ET-interval
      sub with no other timed team sub falls back to HT. Rare and cosmetic (wrong
      break label); inherent without provider clock data.

## Predictive bracket (deferred from the feature-treatment review)

- [ ] Best-third SLOT assignment is a maximum bipartite matching (Kuhn) of slots
      to qualifying thirds - it fills every fillable slot (the empty-slot
      starvation that left 3DEIJL blank in 1.30.0 is fixed in 1.30.1) - but it is
      still not FIFA's fixed combination table (which set of qualifying groups
      maps to which slots). The projected SET of best thirds is correct (top-N by
      points/GD/GF) and all slots fill, but the slot each third lands in may
      differ from the official table. Implement the per-format third-placed
      combination tables (WC2026 8-of-12, Euro2024 4-of-6) for exact placement.
- [ ] groupReady is "every team has played >= 1", read off the standings rows.
      A data gap (a group team's fixtures missing from the feed) can make a group
      read "ready" with too few rows, so rankThirds' rows[2] is the last of three
      (really a runner-up), projecting a wrong third. Guard on the expected group
      size if feed gaps ever occur.
- [ ] thirdsToQualify is derived as the count of third-placeholder slots in the
      provider bracket; a malformed feed (extra/missing third-slot) silently
      changes how many thirds project. Tie it to the format if it bites.
- [ ] Placeholder parser: a localized compact ordinal ("3e A/B") would mine a
      spurious group letter (E). FIFA emits ASCII compact ("1A"/"2B"/"TBD"), so
      speculative; tighten if a provider localizes the placeholders.
- [ ] `orderBracketFeeders` recovers number -> feeder for "W{n}"/"RU{n}" parent
      references by assuming providerMatchId is monotonic in match number within a
      round (sort-and-zip). Holds for FIFA (the only provider emitting W-refs;
      UEFA's bracket carries team names/codes so the ref path never engages). If a
      future provider emits W-refs with numeric ids unrelated to match order, the
      zip mispairs silently with no guard. Tie the number to a real provider field
      (a MatchNumber) if one becomes available.
- [ ] Verify the real provider PlaceHolderA/B strings against live data once a
      group stage is in progress. The parser degrades safely to official-only on
      anything it can't read, so confirm it actually projects (not just no-ops).

## Match line-ups (deferred from the feature pass)

- [x] The pitch buckets the XI by position category (GK/DF/MF/FW), not by the
      exact formation bands. A 4-2-3-1 collapses its holding pair and its three
      attacking mids into one MF row, so the rendered shape can differ from the
      formation chip. Resolved: `pitchRows` (app/utils/lineup) now slices the ten
      outfield players into the formation's bands when the feed ships a usable
      formation string (FIFA's Tactics), falling back to position grouping when
      it doesn't (UEFA ships none). Per-player FIFA `Position` is only the coarse
      0-3 category and `LineupX/LineupY` come back null, so exact-coordinate
      placement still isn't possible - the formation string is the best signal.
- [ ] UEFA carries no captain flag in the lineups payload, so no captain is
      marked for Euro matches (FIFA does). If UEFA exposes it elsewhere (or the
      armband shows in the events feed), wire it in.
- [ ] Players link to the team page, not a per-player page (none exists). If a
      player detail page lands, deep-link the chips to it.
- [ ] No live verification yet: confirm the tab against a real match in-browser
      once a kickoff is ~1h out (FIFA WC2026 + a UEFA fixture), checking the
      pre-announcement empty state, the photo/number fallback, and hydration.
- [ ] UEFA availability is gated only on a non-empty field[], not on the
      `lineupStatus` the feed also ships (e.g. `TACTICAL_AVAILABLE`). If UEFA ever
      populates field[] for a provisional/predicted XI, the tab would surface a
      guessed side. Once the real lineupStatus enum is known, gate on a confirmed
      value too (the field is already parsed into UefaLineupsResponse, just unused).
- [ ] The lineups route catch swallows every provider error (rate-limit, upstream
      5xx, parse) into `{ lineups: null }` with no log, indistinguishable from "no
      XI yet" and not cached, so the next poll re-hits a throttled upstream. Add a
      log + a short negative cache so a failing upstream isn't hammered every 60s.

### Precise placement (deferred from the feature-treatment review, 1.31.3)

- [ ] `parseBands` (server `sofascore-positions.ts`) duplicates `parseFormation`
      (`app/utils/lineup.ts`) - the same formation-string grammar in two layers.
      Extract one pure helper to `shared/` so the band-row fallback and the
      Sofascore coordinate path can't drift on which formations are valid.
- [ ] The cycletls Go uTLS helper is spawned once (`sofascore-http.ts`) and never
      reaped - no `.exit()` / shutdown hook. Benign in a container (the child dies
      with the process), but a dev HMR reload or a multi-instance setup can orphan
      it. Add a Nitro `close` hook that calls the instance's `.exit()`.
- [ ] Supply-chain: cycletls ships a prebuilt Go binary trusted on faith (pinned
      to an exact version, runs in-container, opens a localhost-only control
      socket). Consider vendoring/building it from source in CI, or auditing each
      bump.
- [ ] `applyCoords` is all-or-nothing per team and returns the team untouched when
      it can't place every starter - fine today (FIFA ships no coords, UEFA ships
      all). If a future provider ever ships PARTIAL native coords, `placed()`
      would drop the whole side to bands and discard the real coords it had.

## Share cards (deferred from the feature pass)

### Deferred from the feature-treatment review

- [ ] The card-summary shape is hand-declared three times: `ShareCard` in
      `ShareCardView.vue`, `ShareSummary.card` in `s/[token].vue`, and the server
      `ShareCardData` in `server/utils/share/card.ts`. Adding a field means editing
      three interfaces and a miss is a silent mismatch (the API route's return is
      outside the coverage gate). Hoist a single `shared/` card-summary type and
      import it in all three. (Round/tier/score/flag helpers were unified into
      `shared/share-card.ts` in the review; the type wasn't.)
- [ ] `s/[token].vue` `downloadImage()`/`copyLink()` re-inline the blob-fetch ->
      object-URL -> anchor-click -> revoke dance (and the clipboard + toast) that
      `useShareCard` already implements. Extract a shared `downloadImage(url)` /
      `copyLink(url)` so the landing page and the composable share one path
      (neither file is gate-covered, so the dup is invisible to the gate).
- [ ] `ShareTranslate` (i18n.ts) and `Translate` (app/utils/format.ts) are the
      same `(key, params?) => string` contract under two names. Unifying them
      would let `roundLabel`/`tierLabel` be called directly by the OG renderer
      instead of the key-returning `roundLabelKey` shim added in the review.
- [ ] Share tokens are permanent capabilities (no `exp`, payload is versioned but
      time-unbounded). A leaked `/s/` or `/og/share/` link resolves forever; the
      only revocation lever is rotating `betterAuthSecret`, which breaks every
      session site-wide. If link-leak becomes a concern, add an `exp` to the v1
      payload (verify already rejects on shape, so bumping is cheap).

- [x] Share button on the match-page pick block AND on each predicted card in
      the fixtures list (`matches/index.vue`, beside the joker toggle, gated on
      `predByMatch[m.id]`). `SharePickButton` keys off `matchId` + `kickoffTime`
      and mints by the viewer's own userId, so it drops into any surface where
      the viewer owns the pick. Remaining: a user's profile shows their own
      picks via `PredictionList` with no share (see the next item - that path is
      owner-independent by design).
- [ ] `PredictionList` (bot consensus + another user's profile) deliberately has
      NO share button: mint resolves the pick by the caller's userId, so a
      non-owner mint 404s. A "share someone else's pick" surface would need a
      different (owner-independent) token model - out of scope by design.
- [x] The card now shows team flags above the code pills. satori can't fetch
      remote images, so the render route fetches each FIFA flag, inlines it as a
      data URI, and caches it per code for the process; a failed fetch resolves
      to null and the block falls back to the code pill alone (so a flaky CDN
      never breaks the render). Remaining: the cache is unbounded (one entry per
      team code, fine at tournament scale) and per-instance.
- [ ] Only the 1.91:1 unfurl size renders. A square (1:1) / portrait (9:16)
      variant for Instagram/stories would need a size param on the render route
      + a stories-oriented layout in the template.
- [ ] Round-recap / whole-round card (the "per-round" scope) is deferred: folds
      into Tournament Wrapped or a later multi-pick card. v1 is per-pick only.
- [ ] `/og/share/[token]` has no negative cache and no render-error guard: a bad
      token 404s cheaply (no DB), but a valid token whose satori/resvg render
      throws would 500 on every hit. Catch render errors (fallback image or a
      short-cached 500) and add a tiny negative cache if a hot bad token bites.
- [ ] The three share endpoints (`POST /api/share/mint`, `GET /api/share/[token]`,
      and the non-/api `GET /og/share/[token]`) aren't in the sampled API
      response schemas (`response-schemas.json`); add the two `/api` ones on the
      next controlled regen (their inline `defineRouteMeta` OpenAPI already ships).
- [ ] No live cross-platform verification yet: once deployed, confirm the link
      actually unfurls (X, Facebook, WhatsApp, Discord, iMessage) and the OG
      image renders for a real token, plus the sealed/reveal/result states in a
      real browser. (Same lesson as line-ups: build-green is not unfurl-green.)
- [ ] `server/assets/fonts/SOURCE.md` bundles into the nitro raw chunks
      (harmless ~1KB `SOURCE.mjs`). Move the provenance doc out of `server/assets`
      if the stray chunk ever bothers.
- [ ] Klingon (tlh) share strings are best-effort terse forms, not verified
      canonical tlhIngan Hol - revisit if a fluent reviewer is available.

## League chat / E2EE (deferred from the feature-treatment review)

- [x] Key-substitution / TOFU pinning (shipped in 1.35.0): a "Verify keys" panel
      shows a safety-number fingerprint per member for out-of-band comparison, the
      client pins each member's key on first sight and warns site-wide if it
      changes, and keyholders no longer auto-wrap the group key to a changed key
      until the user accepts it (detection plus prevention of the automatic leak).
      Residual gap below.
- [ ] First-contact TOFU window: a server that substitutes a member's identity
      key BEFORE this device has ever pinned it (the member's first appearance, or
      a brand-new member) is trusted blindly - pinning only catches a key that
      changes after first sight. Closing this needs an out-of-band key channel
      (compare the safety number, which the UI offers but cannot force). State the
      "verify before you trust a new member" expectation in the warning copy.
- [x] Re-key / revocation on membership change (shipped in 1.35.0): an admin
      "Rotate key" action bumps the epoch and re-wraps a fresh group key for the
      current members; removed members get no new key and the server gates both
      old and new ciphertext on current membership, so rotation is real
      revocation. Old ciphertext stays at the old epoch and the client holds an
      epoch->key map so prior history stays readable. Auto-rotate on member
      removal is still manual-only (an admin must click Rotate key).
- [ ] `addWrappedKeys` first-write-wins (`onConflictDoNothing`): a member can
      still plant a junk `wrappedKey` for a peer, silently dropping the real
      keyholder's later wrap - a per-member denial-of-decryption. Rotate-key now
      gives a recovery path (the stuck member gets a clean key at the new epoch),
      but the grief itself is not prevented. A robust fix needs proof the actor
      holds the group key (hard while server-blind).
- [ ] `useChatKeyVerification` pins/verified grow unbounded in localStorage (one
      entry per userId ever seen, across all leagues, never pruned). Harmless but
      no eviction; prune to current co-members if it ever matters.
- [ ] `listMessages` backward pagination (`before:` -> `lt(createdAt)`) has no
      compound cursor, so two messages sharing a `createdAt` at a page boundary
      can be dropped/duplicated. The chat "Load earlier messages" control now
      drives this (client passes `before`), and the composable dedupes prepended
      pages by id so a duplicate is dropped, but a message could still be SKIPPED
      at a 50-message boundary that splits a same-millisecond pair. `ORDER BY` has
      an `id` tiebreaker; wire a `(createdAt, id)` keyset cursor to fully close it.
- [ ] Chat: the ~1px vertical jitter while typing (rare, not reproducible on
      command) is unfixed - likely the autoResize `Textarea` oscillating its
      height by a subpixel near a line boundary, or a message-list reflow. Pin a
      stable line-height/min-height once it can be reproduced.
- [ ] `getMemberPublicKeys` (chat status payload) lists every member's userId +
      public key with no profile-private / admin-hidden filter, unlike
      `listLeagueMembers`. Exposure is limited to fellow league members and is
      arguably required for E2EE key-wrapping, but it leaks the existence of a
      roster-hidden member to peers; reconcile the two visibility rules if hidden
      membership becomes load-bearing.
- [ ] `ChatPanel` `fmtTime` uses `toLocaleTimeString` with no explicit timezone:
      render-env locale/tz dependent and an SSR/hydrate mismatch in theory
      (mitigated today because the list is behind client-only ready state).

## Chat: threads / mentions / embeds (deferred from the feature pass)

- [ ] Thread reply composer is text-only: no image attach, emoji picker or `@`
      autocomplete (mentions are still extracted on send). Fold the main composer's
      affordances into the thread composer, or extract a shared composer component.
- [ ] Threads are one level deep by design (`threadId` is the thread root; a reply
      to a reply points at the same root). No nested threads. `parentId` (quote) is
      a separate relation that does still show in the main list.
- [ ] `threadCount` and unread-mention counts are in-memory/per-session and ride
      the live push; a hard reload re-derives counts from the room page but loses
      accrued unread-mention badges (consistent with the existing unread model).
      The live thread count can drift if a `chat:new` echo is missed (reconciled
      on the next room load).
- [ ] Link unfurl cache is a per-instance in-memory Map (no shared/persistent
      cache); multi-instance deploys re-fetch per instance. Move to a shared cache
      (or a small table) if previews get heavy.
- [ ] Inline external images and unfurl images are loaded by the reader's browser
      (referrer stripped) - this leaks the reader's IP to the third-party host.
      Accepted under the "auto + collapsible" choice; revisit if a privacy toggle
      is wanted.
- [ ] Mention list filters league members by name substring only (no fuzzy match,
      no recency ranking) and caps at 6; no keyboard-less mobile affordance beyond
      tapping a candidate.
- [ ] Mention encode/decode is heuristic: the composer maps `@DisplayName` back to
      `@<id>` by matching league-member names (longest first). Two members with the
      same display name resolve to one id; a name that collides with arbitrary
      typed text could over-match. Switch to an inline token model if it bites.
- [ ] The hand-rolled emoji dataset is a curated subset, not the full Unicode set;
      extend or swap for a generated dataset if coverage gaps show up.
- [ ] Chat search is client-side over the LOADED page only (E2EE - the server
      can't search ciphertext); deep history needs "load earlier" first. No
      match highlighting or jump-to-result yet.
- [ ] Live display-name update: the better-auth `user.update` after-hook fires on
      ANY user update, so it re-broadcasts the name even on a skin/avatar change.
      Cheap (profile edits are rare) but could be gated to actual name changes.
- [ ] Share-image font fallback fetches Noto subsets from Google Fonts at render
      time (cached per process); offline/blocked it degrades to tofu as before.
      Consider bundling the common scripts if the network dep is a problem.
- [ ] Animated GIF uploads are stored uncompressed (canvas re-encode would flatten
      them), bounded only by the 5 MB original cap; large GIFs ride the 9 MB
      ciphertext cap. No server-side transcode/size optimization.

### Deferred from the feature-treatment review (worktree-chat-more)

- [ ] Link-unfurl has a DNS-rebinding TOCTOU: `assertPublicHost` resolves the
      hostname and rejects private addresses, but cycletls re-resolves the hostname
      itself when it connects, so a low-TTL attacker domain can pass the guard as
      public and resolve to an internal IP at fetch time. Pinning to the validated
      IP was tried (1.42.0) and reverted (1.42.1): cycletls ignores a Host override
      and CDN/vhost edges 403 a direct-IP request, breaking previews for the
      Cloudflare-class sites this feature targets. Closing it needs an IP-pinning
      fetch engine that ALSO defeats TLS fingerprinting (cycletls has neither a
      connect-by-IP option nor Host-header support); reassess if such an engine
      appears, or front the unfurl fetch with an egress proxy that blocks RFC1918.
      The literal-IP and resolve-time private-host blocks still hold.
- [ ] Link-unfurl response is byte-capped only AFTER cycletls buffers the whole
      body (`(await res.text()).slice(0, MAX_BYTES)`): MAX_BYTES bounds what we
      parse, not what we download, so a huge text/html response is fully resident
      in memory first. cycletls has no streaming/size cap, so a true fix needs a
      `Content-Length` pre-check or a different fetch engine; the 30s request
      timeout is the only current bound. Also add a per-user rate limit on
      `/api/chat/unfurl` (none today) to blunt repeated large fetches and the
      internal port-scan timing oracle.
- [ ] `typingMembersCache` (league-chat) and `fallbackFontCache` (og share) are
      module-level Maps with no eviction/size cap: one entry per league that ever
      typed, one per distinct non-Latin name segment ever rendered. Bounded by
      distinct leagues / names but monotonic for the process lifetime - add an LRU
      or TTL sweep if memory creep is observed.
- [ ] Thread-reply moderation does not decrement the root's live `threadCount`
      (`bumpThreadCount` is only ever +1 on the chat:new echo; the chat:moderation
      push carries no `threadId`). "N replies" stays inflated until a room reload
      (`getThreadCounts` excludes REMOVED). Send `threadId` on the moderation push
      and decrement, or refetch counts.
- [ ] Thread @mentions don't badge: a mention inside a thread reply is now ignored
      by `useChatActivity` (was: badged then silently cleared on room open). Proper
      behavior is a thread-scoped unread/mention badge that clears when the THREAD
      is opened. Needs per-thread unread tracking.
- [ ] Duplicated UI primitives: a full-screen image-zoom overlay (Esc + fixed
      overlay) is re-implemented in `ChatMessageContent.vue` and `ChatPanel.vue`
      while `ChatLightbox.vue` already exists; the "resolve the input/textarea
      inside a PrimeVue component `$el`" cast is copied in three places. Hoist an
      `<ImageZoom>` primitive and an `inputElOf` helper.
- [ ] Several chat server files still import `shared/types/*` via deep relative
      paths instead of the `#shared` alias (the two new unfurl files were fixed in
      review). Type-only so no build break, but reconcile the rest.

## Presence (deferred from the feature pass)

- [ ] Idle is a single per-user flag (last ping wins), not per-connection: with
      two tabs, one going idle can show the user idle even if the other is active.
      Track idle per-subscriber and OR them if it matters.
- [ ] Presence broadcasts to ALL connected sockets on every status transition
      (global, not scoped to who can see the user). Fine for a pool-sized app;
      O(users) per transition. Scope to relevant viewers (shared leagues) if it
      grows. Note this also reaches fully-unauthenticated guest sockets, disclosing
      which (publicly-identifiable) user ids are online/idle in real time to
      anonymous clients - gate to authed sockets if presence privacy matters.
- [ ] Presence is in-memory per process (single-instance assumption, like the rest
      of the live hub). Multi-instance would need a shared presence store / pub-sub.
- [ ] No "last seen" timestamp - offline is just absence; a "last active 5m ago"
      would need persistence.
