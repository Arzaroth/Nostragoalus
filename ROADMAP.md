# Roadmap

Agreed feature backlog with design notes, so decisions aren't lost. Rough
effort buckets; order within a bucket is not priority.

## Up next

- [x] **Roadmap page (MVP)** (shipped in 1.1.1): admin-filled items with
      status (planned / in-progress / shipped), public `/roadmap` page,
      `mise run roadmap-add` / `roadmap-seed` CLI. User suggestions +
      upvotes deferred to v2 (see Features below).

## Quick wins

- [x] **Auto-refresh on new version** (shipped in 1.5.0): Nuxt built-in
      (`app:manifest:update` hook / `checkOutdatedBuildInterval`), toast "new
      version available, reload?".
- [x] **League invite links** (shipped in 1.6.0): 96-bit tokens, optional expiry + max-uses, owner/moderator mint/
      revoke. Public `/leagues/join/[token]` previews the league signed-out and
      bounces through login via a same-origin-guarded `?next=`, auto-accepting
      on return. Accept is atomic (conditional use-increment gates the cap).
      Reuses the existing addMembership join path (ownerless-league claim, opt-
      out clear). Kept the short join code too - the link is the easy path, the
      code the fallback.
- [x] **Per-match league standings** (shipped in 1.12.0): a "League" tab on the
      match page ranks the selected
      league's members by the points their pick scores on that one match.
      Decisions: reuse the finalize scoring engine for live matches
      (provisional, scored at the current scoreline), persisted points once
      finished; the crowd-rarity bonus stays measured against the whole field,
      only the displayed rows are league-scoped (mirrors the league crowd
      totals). Picks hidden until kickoff (server scope 'upcoming', no rows) so
      it can't leak picks - same copy-protection as everywhere else. League
      leaderboard visibility rules (admin-hidden dropped except self, private
      profiles for members/admins only); non-predictors shown as a muted count.
      Refreshed off the existing live-score watch + 45s poll, no new socket.
- [x] **Changelog since-last-seen** (shipped in 1.25.0): store last-seen version
      per user, a badge dot on the account menu, and highlighted delta sections
      on the About page. The marker rides a better-auth additionalField
      (remembered across devices) and is baselined on first load, so the badge
      fires on the next release rather than the whole back catalogue.
- [x] **Next-match CTA** (shipped in 1.4.0): on the home banner when logged in; scrolling
      dismisses it, and a dismissed match doesn't re-show (sessionStorage).
- [ ] **Main page rework** (in progress on worktree-main-page-rework): a rolling
      refresh of the landing/home page so it gets you to the matches and your
      picks faster and shows its best side. Multi-slice; the banner intro is the
      first slice, more below.
  - **Banner intro (done, pending merge)**: the scroll-scrubbed banner journey
        (centered card -> full-bleed strip -> slim pinned bar) buried the
        essentials below a decorative banner, and the slim state existed only at a
        single scroll position so reading the page re-expanded it. Adds a
        viewport-anchored scroll cue (fixed bottom-center, reduced-motion safe,
        hidden while the next-match pill shares that slot) that latches the banner
        slim and scrolls the hero just under it - content-relative, so it lands the
        same on any viewport. Once docked (cue or manual scroll) the bar holds slim
        until the page returns to the very top. Deferred: on very small phones a
        manual scrub still half-shrinks the strip over the content; a screen-aware
        phase length or a mobile-simplified banner would close that (TODO.md).
  - **Planned slices** (from the product discussion, refine as we go): logged-out
        value-prop + sign-up/login CTA in the hero; a live teaser even when signed
        out (next-match card, leaderboard top 3, player count); conditional-by-auth
        landing so returning users skip the big intro / start on a slim bar.
- [ ] **iCal feed**: per-user calendar subscription with fixtures + pick
      lockout deadlines.
- [ ] **"The Equalizer" bot mode**: always picks 1-1 (modal draw score) to
      leverage the draws-score-something floor. Verify the "draw pick always
      >= 2 pts" premise against the tier table first; if outcome-miss = 0 the
      bot is terrible, which is also funny - ship either way.
- [ ] **Evil twin**: derived view, zero schema - your twin picked the swapped
      score of every prediction; see how it fared. Draws are self-twins by
      design; one-line tooltip ("even your evil twin agrees") instead of a
      rules paragraph. Exact draw handling still TBD (swap vs crowd-derived).
- [x] **Email verification for signups** (admin runtime toggle, shipped in 1.8.0):
  - Flag in a new generic `app_setting` key-value table (the SSO config path
    is its own encrypted table; a plain boolean didn't need that). better-auth
    1.6.14 reads `requireEmailVerification` live per request (verified it's
    never captured at init), so it's exposed as a **getter** over a synced
    in-memory cache - the toggle takes effect with no redeploy, no sign-in
    hook needed. `emailVerification.sendVerificationEmail` always configured.
  - Toggle gated on SMTP (`NUXT_SMTP_URL`); enabling without it is refused.
  - Grandfather: enabling sets every existing account `emailVerified = true`
    (done in the service, so no hand-written data migration).
  - SSO sign-ins exempt for free - the gate lives only in the email/password
    sign-in route; SSO uses a different route and arrives verified.
  - Admin **force-verify** action on any unverified user, in the user row menu.
  - Unverified-account TTL: daily `users:prune-unverified` task deletes
    `emailVerified = false AND createdAt < now - 7d`, exempting SSO-linked and
    admin accounts, and self-gating to a no-op unless verification is required
    (otherwise unverified is the normal state and it would wipe everyone).

## Features

- [x] **Editable scoring config + per-competition overrides** (shipped in
      1.13.0): admin Scoring rules section (`/admin/scoring`) edits the full
      ruleset; the DB row was previously seed-only with no UI. Decisions:
  - One **default** config (null `competition_id`) applies everywhere; an
    optional **override** row per competition supersedes it. Resolution is
    override-then-default (`getScoringConfigFor`). Active-row uniqueness is per
    scope via a partial unique index on `coalesce(competition_id, '')`.
  - **Every save forces a ladder recompute** in the same transaction: bump the
    global config `version`, rescore each affected competition's finished
    matches (the existing version-gate in `scoreMatchRow` does the work) and
    refresh rank snapshots. A default change recomputes every competition
    *without* an override; an override change (or its removal) recomputes just
    that one.
  - `version` stays **globally unique** across scopes so `scoredAtVersion`
    equality can't collide when a competition switches default<->override.
  - **Result-rarity layer** (`crowd_outcome_tiers`): a small bonus for a
    rare-but-correct RESULT, stacked on the exact-score rarity. Only applied in
    EXACT basis (OUTCOME basis already rewards a rare result). Folded into
    `bonusPoints` (no prediction-schema change); `crowdShare` stays the exact
    layer's share. On by default for fresh installs; existing installs keep the
    column null (off) until an admin enables it - so an in-flight tournament's
    standings don't shift without a deliberate, visible recompute.
- [x] **Match watch links** (shipped in 1.19.0): admin/
      bot-curated Live / Replay / Highlights links per match, shown in a Watch
      section on the match page. Decisions: a `match_media` child table (kind +
      url + label + nullable `embeddable` override); a host whitelist
      (YouTube/Twitch/Dailymotion/Vimeo) sets the embed default AND the
      URL->embed-src transform, the override forces embed/link-only for any
      host; whitelisted or force-embedded links play in a sandboxed iframe with
      a permanent open-in-new-tab fallback (a host's X-Frame-Options can't be
      overridden), everything else is an external button. LIVE shows
      pre/in-match, replay+highlights once FINISHED. Public read
      (`GET /api/matches/[id]/media`) + admin write; grey-zone link sourcing
      stays out of the app, so liability sits with whoever sets the link.
      Machine auth (the `apiKey` plugin + admin API-client UI) shipped in 1.18.0;
      the media write routes opt into `apiKey:{media:['write']}` (1.19.0), so a
      scoped key can POST/DELETE links. A forced raw (non-whitelist) embed runs in
      a strict sandbox (no same-origin). Still deferred: the separate curation bot
      that fills links via the API (see TODO.md).
- [x] **In-app notification center** (shipped in 1.17.0): a
      header bell with an unread count and a dropdown feed, live over the existing
      WS. Decisions:
  - `user_notification` table: `type` enum + a typed `payload` jsonb (data-driven
    render, no per-type columns), `readAt` (null = unread), and a nullable
    `dedupeKey` with a partial unique index per user so scheduled-task triggers
    (finalize) are idempotent - `createNotification` does `onConflictDoNothing`.
  - Live push: a `publishUserNotification(userId, dto)` in the live hub, mirroring
    the league-member gate (send only to subscribers whose socket `userId`
    matches); WS type `notification:new`. Client `useNotifications` invalidates /
    prepends on receipt.
  - v1 trigger set: league social events (join -> owner/mods, promote / transfer
    / kick / admin-add -> target), the champion + best-scorer result at finalize
    (dedupe-keyed), the **match result** on each match you predicted (scoreline +
    points, from the finalize scoring tx), and a **pick reminder** (the first
    time-based one): a scheduled `notifications:pick-reminders` task reminds
    active predictors of a match locking within ~3h they haven't picked, per
    match + active-predictors-only to keep volume sane. The reminder is pruned
    when the pick window closes (kickoff) and when the user makes the pick. A tap
    deep-links from the payload.
  - **Deferred to the web-push feature** (push payloads; the center takes new
    types trivially): goal-on-a-predicted-match alerts, and re-using the existing
    PICK_REMINDER / MATCH_RESULT data as push notifications. A coarser per-round
    digest could later replace the per-match reminder/result volume if it proves
    noisy at scale. Retention shipped: the daily `notifications:prune` task drops
    read notifications older than 7 days and caps each user to the newest 200, and
    any notification can be dismissed individually (pick reminders also self-prune
    at kickoff).
- [x] **Web push** (shipped in 1.21.0; installable PWA + offline
      shell shipped in 1.5.0): `@vite-pwa/nuxt`; web push (iOS >= 16.4 for
      installed PWAs). Browser opt-in is the master gate; on top of it, **every**
      notification kind has a per-category push toggle in a new Notifications prefs
      panel. Decisions:
  - Push catalogue (each a toggle): pick reminders (default on), match kickoff
    (new `MATCH_LIVE`, on), live goals (new `GOAL`, on), match results (on),
    tournament results - champion + best scorer (on), league activity (off). All
    toggleable; league social defaults off as low-urgency.
  - **Scoped to your matches**: `MATCH_LIVE`, `GOAL` and `MATCH_RESULT` only push
    to users who actually made a prediction on that match (keyed on a `prediction`
    row). `MATCH_RESULT` already emits to predictors; goals/kickoff inherit the
    same gate.
  - `MATCH_LIVE` and `GOAL` are **push-only, transient** - never stored in the
    bell (a goal-heavy match would flood the feed). The other categories reuse the
    existing in-app notification rows; push is an opt-in delivery layer fired from
    `createNotification` (gated by each user's subscription + category toggle).
  - New triggers fire off the live score poll: a goal newly written to
    `goal_event` -> `GOAL`; a match flipping SCHEDULED -> LIVE -> `MATCH_LIVE`.
    Both must fire once (idempotency on the new-goal signal / status transition).
  - Plumbing: a `push_subscription` table, per-category prefs (following the
    existing preferences pattern), VAPID keys via runtimeConfig (new env), a
    service-worker `push`/`notificationclick` handler, and a server `web-push`
    send that prunes dead subscriptions (404/410). Ship before any native wrapper.
- [ ] **Tournament Wrapped**: end-of-competition personal recap - best/worst
      pick, joker efficiency, percentile, biggest rarity bonus - with a
      shareable image card. Pure read-side work.
- [ ] **What-if stats**: "joker on match X = +14 pts", "following the crowd
      would have scored N vs your M" (reuses consensus-bot data).
- [ ] **Personal analytics page**: bias detector - avg goals predicted vs
      real, favorite-team optimism, accuracy by group/team/round.
- [ ] **Prediction share cards**: the lightweight, mid-tournament sibling of
      Tournament Wrapped (which is the end-of-competition card). A shareable
      image for a single pick or a whole round ("I called 3-1 - did you?"),
      generated on the read side so it can ship while the tournament is live
      and sharing peaks. Acquisition lever, not a points feature. Decisions to
      make: card scope (per-pick vs per-round vs both), render path (server
      OG-image vs client canvas), and whether picks stay copy-protected until
      kickoff on a shared card (they must - same leak rule as everywhere).
- [ ] **League rivalry / overtake alerts**: pick a rival inside a league you
      share, get a push the moment they pass you (or you pass them) on that
      league's board. Pure engagement multiplier on the web-push + leagues work
      already shipped - a new `GOAL`-style transient push category gated on the
      rival relationship, fired off the finalize rank-snapshot tick (the league
      board already recomputes there). Decisions: one rival or many, mutual vs
      one-sided (one-sided is simpler and fine), and whether it reuses the
      league-activity toggle or gets its own.
- [ ] **Live pick pulse** (maybe-drop - decide before building): a *field-wide*
      live view, distinct from per-match league standings (1.12.0, which is
      *your league's* members) and live points in the global ladder. The novel
      kernel is the whole field's prediction distribution rendered against the
      live score as it moves - "62% predicted this exact current scoreline and
      are about to bank points; one more goal flips most of the field to
      losers". Spectacle/data-viz over the crowd histogram + live-scoring engine
      that already exist, not new data. Only worth it if that field-level
      drama earns its keep; otherwise drop - the per-match league board and the
      crowd totals already cover the per-member and aggregate angles.
- [x] **Predictive bracket** (shipped in 1.30.0): once a
      group's teams have all played at least once, pre-fill the knockout slots
      that group feeds with the currently-projected qualifiers from the live
      group standings, clearly distinct from officially-decided teams. Decisions
      (locked):
      - **R16 only**, including best-third-placed slots (WC2026 has 8). Later
        rounds stay TBD - they depend on knockout results, not group standings.
      - **All three competitions** (WC2026 12-group + 8 thirds, WC2022 8-group
        top-2, Euro2024 6-group + 4 thirds), each with its third-ranking +
        slot-assignment table; graceful no-op if a slot placeholder can't be
        parsed (show official only, never a wrong projection).
      - Data: the provider already tags each TBD slot with a placeholder
        (`PlaceHolderA/B`, e.g. "1A"/"Winner Group A"/third refs); resolve it
        against `computeAllGroupStandings`. Official = the slot has a real team
        code; projected = resolved from standings.
      - Visual: official slots solid; projected slots dashed + a "projected"
        chip (not color-only). Separate from the "Bracket challenge" game below.
- [ ] **Bracket challenge**: predict the full knockout tree before R16 lock,
      separate points pot. Bracket rendering already exists.
- [ ] **Survivor side game**: one team per matchday, must win, no team reuse,
      last alive wins. Tiny schema.
- [ ] **Achievements / trophy cabinet**: global only, computed from
      competition-level data (never league-relative - kills farm leagues by
      construction). Ideas: prediction sniper, exact-score streaks, "heretic"
      (alone against the crowd and right), wc champ (your champion won),
      wc overall champ (top of a competition ladder), playmaker (your best
      scorer won), averager.
- [x] **Match reactions** (shipped in 1.23.0): fixed emoji palette
      (nothing to moderate) - 🔥 GOAL ⚽ 😮 🤣 😢 😡 - one per user per match,
      toggleable. Decisions made: global aggregate counts are the default and
      public (read-only, no PII); a league-scoped breakdown rides alongside when
      a league is selected (display only, members-only on the server, mirroring
      crowd totals). Reactions open at kickoff and stay open after full-time (no
      pre-match reactions). Live over the same WS as crowd/scores
      (reaction:update + reaction:league-update). No notifications (too noisy).
      Emoji stored as a key (DB enum), glyph rendered client-side so the palette
      can grow/skin without a migration.
- [ ] **League chat (E2EE)** (in progress on feat/league-chat): per-league chat,
      league-global room + per-match threads (one enable per league, threads
      inherit the league key). **Disabled by default**; only OWNER/MODERATOR can
      enable, behind a legal-cover warning modal (owner is server-blind, history
      is unrecoverable if keys/recovery code are lost, owner cannot moderate).
      Design (locked):
      - **Group-key model** (not Signal: its forward-secrecy deletes keys, which
        conflicts with durable cross-device history). Per-user X25519 identity
        keypair; a random per-league group key is sealed (libsodium sealed box)
        to each member's public key; messages are secretbox-encrypted with the
        group key. Server stores only ciphertext + sender id + timestamp.
      - **Silent device-bound enrollment**: keypair generated on first chat use,
        private key non-extractable in IndexedDB - no password prompt.
      - **Recovery code** (generated, shown once): an extractable copy of the
        private key, wrapped under KDF(recovery code), escrowed server-side as
        ciphertext. Restores full history on a new device / after a cache clear;
        server stays blind. Lose all devices AND the code = history gone.
      - **Key distribution**: enabler wraps the group key for current members
        with a published public key; members holding the key lazily wrap it for
        newcomers (eventually-consistent). Re-key by epoch on membership change.
      - Owner-blind moderation: OWNER/MODs + client-side mute/block + leave; no
        global surface, no server-side read path (would break the disclaimer).
      - Transport: ciphertext over the members-only league WS channel + REST
        history (ciphertext pages). Dep: libsodium-wrappers.
- [ ] **Hall of shame (per pick, not per player)**: "shame of the round" -
      one per matchday so nobody is dogpiled tournament-wide. Shameable =
      wrong outcome (a miss) AND max total goal error (|dHome| + |dAway|);
      right-outcome-huge-error is comedy, not shame. Jokered = bonus shame.
- [x] **Champion rank backfill** (shipped in 1.12.1): an admin Background-tasks
      entry that repairs champion picks saved with a null FIFA rank + the flat
      bonus (the ranking feed was Cloudflare-blocked during the pick window),
      re-resolving the pick-window publication (live fetch, bundled snapshot
      fallback, thin-response guard) and recomputing each pick's rank tier.
      Supersedes the prod-only mise CLI task.
- [x] **Second chance for champion / best scorer** (shipped in 1.11.0):
  - Window: **last group round -> first knockout** (option 2), not the whole
    first-kickoff -> R16 span. The re-pick only has info value once the groups
    have played out, and opening at the start of the last group round (WC26
    MD3) still gives a multi-day window - sanity-checked it stays multi-day for
    esports too (LoL Swiss->quarters, CS Legends->Champions, ~1-5 days).
    Defined on `round_kind` (last GROUP_MATCHDAY round kickoff -> first KNOCKOUT
    kickoff) so it adapts per competition shape; no window without group or
    knockout rounds.
  - First re-pick latches a permanent `repicked` flag -> award halved
    (integer-floored) at finalize, even if the user reverts (changing back is
    on him). The original* columns keep the pre-switch pick for display.
  - Confirm modal spells out the permanence; the original shows beside the new
    pick, and the worth display halves for a re-picked pick.
  - Same mechanic for best scorer.
  - Late entry (decided 2026-06-14, during testing): a user with NO original
    pick can make a first pick inside the window too, born halved (repicked,
    no original). The half-points already prices the late-info edge, same as a
    switcher, so locking out non-pickers entirely was needlessly punitive.
    Pickers show in the window regardless of an existing pick ("Pick for half").
- [ ] **Roadmap v2 - user suggestions + upvotes** (MVP page is in "Up next"):
      suggestions feed the roadmap, roadmap items get user upvotes. One
      schema, two views. CLI pull command for suggestions. Spam guard: auth
      required + rate limit.
- [ ] **Roadmap as kanban board**: render the /roadmap page as columns per
      status (planned / in progress / shipped) instead of stacked sections;
      admins drag cards between columns and reorder within one (replaces the
      up/down buttons). Public view read-only.
- [ ] **Half-time prediction change ("the VAR")**: overturn your own call on
      a live match before the second half kicks off.
  - League house rule behind a new per-league **difficulty setting**; off by
    default, league owner enables.
  - One change per round (same scarcity as the joker) - a rescue flare, not
    a strategy.
  - Penalty: changed pick scores **floor(base pts / 3)** - with the current
    tier table only an exact second-half read scores at all (3->1, 2->0,
    1->0). Floor, not round: the design intent lives in that rounding rule.
  - **No rarity/odds bonus** on a changed pick: rarity is measured against
    the pre-match crowd the new pick was never part of (and closing odds
    price uncertainty you no longer face) - paying it would hand hindsight
    a bonus. Net effect, the one-sentence rule: a VAR'd pick is worth
    exactly 1 point on an exact score, 0 otherwise.
  - Changing **burns the joker** (no refund): the joker is a pre-match
    confidence bet; mid-match edits forfeit it. Uniform penalty, kills the
    "joker every round, adjust at HT" exploit.
  - No honors on changed picks: excluded from achievements/badges/rewards.
  - Original pick retained and shown alongside the new one.
  - Scoring model: ONE global change per user (no per-league predictions -
    they'd poison crowd totals, rarity and storage). Finalize computes both
    values (original points, changed points); league boards with the rule ON
    rank on the changed value, leagues with it OFF and the **global board
    always rank on the original** - global stays a pure pre-match game.
- [ ] **Match line-ups**: starting XI + bench (+ formation if the feed has
      it) on the match view, sourced from the existing data providers.
      Squad/player pages already exist to link into.
- [ ] **League rewards + "My fridge"**: league owner attaches real-world
      stakes to the season ("most exact scores -> bottle of Saint-Emilion").
  - Criteria from a **curated, auto-computed list only** (league winner,
    most exact scores, best matchday, most jokers converted, ...); reward is
    free text. No custom criteria - everything resolves from data.
  - Awarded automatically at competition end; the app tracks honor, humans
    hand over the bottle (no in-app transactions, it's a social contract).
  - **"My fridge"** page: every reward you've won across leagues, because
    arguably you're winning wine bottles.
- [ ] **Prune inactive users** (admin):
  - Users with predictions are load-bearing (historical rankings, crowd
    totals, rarity): **anonymize, never delete** - keep picks/points under
    "Deleted player", drop PII (reuse the account-deletion flow's logic).
  - Hard-delete only zero-content accounts (no picks ever) after long
    dormancy.
  - "Inactive" must span the 4-year cycle: roughly no login for ~3 years,
    i.e. missed an entire competition cycle they were registered for.
  - Warning email + 30-day grace before acting.
- [ ] **Multi-season / multi-competition leagues**: `league_competitions`
      join table, backfill migration from the current column (leagues are
      live in prod). "Extend" action on a league, cancellable as long as no
      pick has been scored in the newly added competition.

## Big rocks

- [ ] **League import from other services** (MPP first):
  - Spike the source format first: MPP has no public API - figure out what
    an owner can actually export/hand us before designing the importer.
  - Member mapping: **email first, claim-link fallback** - auto-attach to
    existing accounts when the export has emails; everyone else becomes a
    ghost member (display name + imported standing) holding a claim
    link/code the owner distributes; claiming binds a real account.
  - Imported standings are historical flavor (shown on the league), not
    points in our ladder - scoring systems don't translate.
- [ ] **More competitions**:
  - Spike order: UCL 2025-26 first (check the UEFA API covers it; cheap test
    of long-format comps in the round model), then EU top-5 leagues, then
    rugby (WC + 6 Nations), then LoL Worlds / CS majors.
  - Rugby: closeness tiers need retuning (27-24 scorelines, rare draws);
    sport switch drives theme or at least logo.
  - Esports: series scores (3-1 in maps) fit the existing score model.
  - UX: the default never changes - football internationals, zero questions
    asked, no onboarding quiz. Per-user **followed competitions** set; pill
    switcher shows followed + "more..." browser; following is the lazy
    opt-in. Long club comps default to a **featured view** (top-table
    clashes + the user's followed teams), full matchday behind a tab.
    Picking stays optional per match; rankings stay total-points.
- [ ] **Mobile / desktop apps** (tech showcase, no store publishing planned):
  - PWA first regardless (see push above).
  - Then **Tauri v2** for both desktop and mobile (single framework, small
    binaries, system webview) - better showcase than Capacitor + a separate
    desktop stack. Capacitor remains the boring-proven fallback if Tauri
    mobile bites.
  - Electron / Neutralino / Electrobun ruled out (size / ecosystem /
    maturity).
- [ ] **Tamper-evident / E2EE scores**:
  - Phase 1 **commit-reveal** (IN_PROGRESS, worktree-tamper-evidence). Locked
    design: an append-only `prediction_commitment` ledger, hash-chained like a
    blockchain (no PoW/consensus) - each entry's hash folds in the prior head,
    so a retro-edit forces rewriting every later entry. Anchor is **in-DB only**
    (head exposed on the public `/verify` page to snapshot; an external anchor
    like OpenTimestamps was considered and deferred). Scope is **score
    predictions only** (champion + best-scorer picks deferred). The commitment
    binds `subject = sha256(userId)`, never the raw id, so the public reveal
    proves integrity without deanonymizing private profiles. A 256-bit salt
    keeps picks hidden while the commitment is already public; the opening
    (score + salt) is revealed only once the match kicks off. The whole ledger
    is recomputed client-side on `/verify`, trusting its own math, not a server
    flag. Keeps the global leaderboard, no key-management UX.
  - **Distributed witnessing (localStorage):** each browser pins the highest
    head it verified in localStorage (never sent to the server) and on each load
    fetches only the extension since its pin to prove the chain still extends it
    (a Certificate-Transparency-style consistency proof). A retro-edit to
    anything that device already saw is flagged automatically (footer warning +
    `/verify` panel) - turning every visitor into a witness, so no one has to
    save a hash by hand. Residual gap: split-view / equivocation (serving fork A
    to one user, fork B to another) is NOT caught by per-device localStorage -
    each fork is internally consistent. Closing that needs cross-client head
    gossip, which is the same job as the deferred external anchor.
  - Opt-in per-league **E2EE tier** as the hardcore showcase: client-side
    scoring, league-shared key (HKDF-derived from a league master key).
    Known costs: key distribution on join, key loss bricks the league, and
    server-blind leagues lose crowd totals / bot / global board.
- [ ] **SCIM provisioning**: pairs with the SSO story (deprovisioning is the
      real enterprise ask). Survey the better-auth ecosystem before
      hand-rolling. Low priority until an actual IdP user exists.

## Dropped / rethink

- **Arrow-key score navigation**: dropped - up/down must stay native input
  increment; enter/space already covers the flow.
- **Live admin commentary**: needs a rethink - it's an ops commitment (a
  human typing through 104 matches), and admin-as-player risks perceived
  unfairness/toxicity. X embeds are dead/paid API. Existing goal timeline +
  WebSocket already covers "live"; a per-match admin-pinned announcement is
  the reduced form if revisited.
