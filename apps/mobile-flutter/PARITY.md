# Nostragoalus mobile - feature parity tracker

Every web feature (from `apps/web-nuxt/app/pages/**` + the API surface) mapped to
the Flutter app's status. This is the real progress board - keep it honest.

Legend: `[x]` shipped + validated · `[~]` partial (usable, gaps noted) · `[ ]` missing
· `[!]` blocked on hardware/account/server (reason noted)

Validated = builds + the path was exercised on the emulator/device. Endpoints with
a provider+screen but no live data on the dev stack are still `[x]`/`[~]` (wired),
with the data caveat noted per area.

---

## Auth & account
- [x] Email/password sign in (bearer session, secure-storage token)
- [x] Sign out
- [x] SSO sign in - email-domain detection, then a server authorize route opened
  IN the browser (better-auth sets its CSRF state cookie on the sign-in response,
  so the browser has to be what makes that request), on to the IdP, back through
  a server park route that mints a single-use code, redeemed over a verified App
  Link (no custom scheme, no trusted-origin config: the callbackURL is relative).
  **Verified end to end on a real device against a real IdP (4.7.4)**: signed in,
  session minted, app returned to. Needed NUXT_ANDROID_CERT_FINGERPRINTS on the
  server so /.well-known/assetlinks.json verifies the App Link. iOS still needs a
  Team ID
- [x] Sign up (native form)
- [x] Forgot / reset password (request-reset form)
- [x] Two-factor (2FA enrol: password -> secret + backup codes -> verify; disable
  with password + current code) - QR shown as secret/otpauth (no QR renderer)
- [x] Email verification flow (unverified banner + resend link)
- [!] Passkeys - no maintained Flutter platform-authenticator (FIDO2/WebAuthn)
  plugin; needs native Credential Manager integration
- [x] Connected sessions / devices (list + revoke)
- [!] Confirm-credentials / revoke-trust - the trust flag is a better-auth
  HttpOnly cookie; bearer-token mobile sessions never set it, so it's inert here
- [x] Preferences: show-crowd, show-odds, light/dark/system theme
- [x] Account home - identity + links + edit profile (display name + avatar upload
  via image_picker -> data URL update-user)
- [x] Locale switch (5 locales, RTL) - `[ ]` not yet persisted to the server profile

## Competition
- [x] Competition browse + switcher (all scoped reads honor it)
- [x] League lens (the web's `LeaguePill`) - app-bar switcher on matches +
  leaderboard, Everyone or one of your leagues, persisted per competition,
  cleared at sign-out, pruned when you leave the league and dropped when a
  lensed read 404s; scopes the leaderboard and crowd consensus.
  `[ ]` reactions are not yet lensed (the web lenses those too)
- [x] Fixtures list - grouped by round, concluded rounds collapsed on load (final
  never folds) [master 4.3.3/4.4.0 parity]
- [x] Standings (group tables)
- [x] Scorers + assists table (competition)
- [x] Leaderboard (+ movement arrow) - league-scoped through the app-bar
  league lens (`?league=`, within-league movement, hidden-member note)
- [x] Multiview grid (live matches)
- [x] Champion pick (FIFA-tiered)
- [x] Best-scorer - interactive Golden Boot pick (team -> squad from
  /api/teams/[code].squad -> save via PUT /api/best-scorer) + top scorers; locks
  at first kickoff. (The "no player-id" earlier claim was wrong - the squad carries ids.)
- [x] Bot personas (per-match bot predictions)
- [x] Wrapped - full recap: totals + rank/percentile, tier breakdown + streak,
  best call, biggest miss, jokers, crowd, champion/scorer, chat, trophy/badge haul
- [x] Analytics - headline tiles + tier bars, goals/outcome lean, home-bias +
  draw-gap, team over/under-rate, accuracy-by-round, best/worst call, Fergie-time,
  current+best streak
- [x] Teams list (competition-scoped)
- [x] Bracket (knockout tree)
- [x] Map / nations - OpenStreetMap world map (flutter_map) with a marker per
  team at its country centroid (green in / grey out) + the still-in / eliminated
  list. Centroids mirrored from the web's country-centroids table (reference data,
  not the API contract - the "no coords" framing was imprecise).
- [x] Compare (player head-to-head) - self vs a leaderboard opponent: points,
  win/tie record, agreement, over-time, divergences

## Match detail (tabs)
- [x] Prediction + joker (score, outcome-only, wager)
- [x] Reactions (6-emoji bar)
- [x] Past-pick counterfactual
- [x] Timeline (play-by-play)
- [x] Lineups (formation + XI)
- [x] Scorers/assists (match)
- [x] Insights - possession, all-time record, recent H2H meetings, home/away form
  (WDL chips), group standings, next fixtures, this-match goals
- [x] League standings (per-match)
- [x] Media / stream links (LIVE / REPLAY / HIGHLIGHTS)
- [x] Live-detail (live stats blob) - venue/attendance, cards, per-team stats,
  goals/bookings/subs; defensive render of the opaque provider payload

## Predictions
- [x] Make / edit prediction + joker
- [x] My predictions
- [x] Past-pick counterfactual
- [x] Crowd predictions view - consensus card under the prediction input (show-crowd
  pref); under the league lens it shows that league's members with the everyone
  line + bonus caveat beneath, falling back to everyone below the anonymity floor

## Leagues
- [x] My leagues list
- [x] Browse public + join by code / by id
- [x] League board (points/survival mode-board) + movement arrows + survival
  elimination (lives-out struck through, eliminated-round label)
- [x] League detail: members, role, mode
- [x] League settings editor (owner/mod): name, visibility, mode, lives,
  description, featured team
- [x] Create league
- [x] Invites (create / list / delete / accept-link via join screen + deep link)
- [x] Leave league / transfer ownership / member management (promote, demote, kick)
- [x] Rewards / prizes (per-league criteria + ranking drill-in bottom sheet)
- [x] Featured team / team specialist (league settings) + full per-criterion
  reward-config editor (label/note/link per criterion, replace-set); `[~]` image
  upload per prize deferred
- [x] Regenerate join code
- [x] Per-league nudge / prompt - "finish your picks" banner on the leagues tab
  (from /api/leagues/completeness), taps through to the needy league

## Messaging (E2EE)
- [x] Crypto module - encrypt + decrypt, proven on-device vs the frozen KATs
- [x] Identity bootstrap (generate / register / restore)
- [x] Recovery-code flow (unlock gate + set-up)
- [x] Key-transparency verify + safety number
- [~] League chat - send / receive / history + message reactions; `[!]` live message
  round-trip needs a provisioned multi-member league (a keyholder to seal keys)
- [~] DMs (1:1) - inbox / room / create; `[!]` live round-trip needs a 2nd user
- [x] Chat rooms tab - top-level nav destination listing direct messages (badged
  with the unread total, kept live off the notifications frame) + one row per
  chat-enabled league, with the competition switcher since the rooms are
  competition-scoped. The web's dock has no mobile equivalent; before this,
  league chat was only reachable through a league
- [x] Chat rich: reactions + report + edit + moderator dashboard + @-mentions +
  E2EE image attachments + threads + presence dots + typing indicator + optimistic
  send (Sending/Not sent + Retry, master 4.4.2 parity); `[!]` delete (no own-message
  delete endpoint - edit only); `[!]` chat-pin is a web dock feature - mobile chat
  is screen-based, no dock to pin
- [x] DM rich: reactions (long-press) + read-on-open + E2EE image attachments
  (send + decrypt-on-demand) + read receipts ("Seen ✓✓" via the otherLastReadAt
  contract field added this branch)
- [x] Identity reset (hard reset -> fresh keypair, revoke old sealed keys, confirm dialog)

## Realtime & voice
- [x] Live scores over WS (subscribe, invalidate, reconnect)
- [x] Live viewers count (per match)
- [~] WebRTC voice mesh (league rooms) - full signaling + mesh; `[!]` audio-through
  needs two participants
- [~] Voice DM 1:1 - call button (voice:invite) + incoming-ring sheet (accept ->
  join / decline -> voice:decline) + DM voice bar; missed calls via the existing
  VOICE_MISSED notification. `[!]` round-trip (ring delivery + audio) needs a 2nd
  peer - compile-validated only, like the mesh audio
- [!] CallKit / background audio / ring push - iOS-only (no Apple). The
  `flutter_callkit_incoming` dependency was removed: it was reachable only from
  dead Phase-0 spike code, and its manifest merged `MANAGE_OWN_CALLS` +
  full-screen-intent (Play-Console-flagged) into the shipped release manifest.
  Re-add it when the feature is actually built.

## Notifications
- [x] In-app notification center (bell + unread badge + mark-all-read)
- [x] Per-type message templates (all 12 types via notifications.item.* i18n +
  per-type icons; humanised-enum fallback for unknowns)
- [!] Push (FCM Android) - the server exposes only web-push/VAPID; mobile FCM needs
  NEW server endpoints (device-token registration + sender) + a Firebase project
- [!] Push (APNs) - no Apple

## Achievements / stats / rewards
- [x] Trophy cabinet - trophies + earned achievements (i18n names/desc), tier
  colour + rarity %, owner sees locked achievements with criteria + progress bar,
  showcase pin/edit (up to 3)
- [x] My stats screen (`/api/me/stats`)
- [x] My rewards screen (`/api/me/rewards`)

## Versions & updates
- [x] The build identifies itself (`x-ng-client: android/<version>`, stamped by
  `apk-publish`), and the server answers 426 for a build below
  `MIN_ANDROID_CLIENT`; the app swaps the whole tree for an update screen
- [x] Manual update check in preferences - "This build" + a button that asks
  `/api/app/android`. Never checks on its own (a sideloaded app cannot install
  its own update, so an unrequested check is only a nag)
- [ ] One version line shared with the web (`apps/web-nuxt/package.json`). Fine
  while the two ship together; splitting it would buy honest per-artifact
  changelogs and cost a second monotonic `versionCode` scheme

## Long-tail & native
- [x] i18n (5 locales incl. RTL Arabic, tlh)
- [x] Konami skins (theme follows `user.skin`)
- [x] OS share (match link, media links)
- [x] Tamper-evidence /verify (commit-reveal ledger)
- [x] Roadmap view (+ upvote)
- [x] Roadmap suggestions (submit)
- [x] About / license / tech-stack page
- [x] Onboarding tour - 8-step paged intro (auto-starts once for new accounts,
  server-dismissed; re-runnable from the account tab)
- [x] Deep links (inbound `goal.arzaroth.com/...`) - invite join, league detail,
  match detail; App Links intent-filter (autoVerify pending server assetlinks.json)
- [x] Feed subscription (calendar) - subscribe (webcal) / copy / regenerate
- [x] Share-token cards - mint + OS-share (analytics /a + profile /p landing
  links, wrapped image URL) + in-app viewer for inbound /a /p /s deep links
  (public, signed-out-friendly)
- [x] App launcher name + icon + native splash (indigo brand, held to first frame)

---

## Cross-cutting
- [x] OpenAPI model codegen + stale-check
- [x] i18n mirror + stale-check; parity KAT mirror + stale-check. Both use
  `git status --porcelain`, so a newly added locale/KAT fails the check too.
- [x] One copy of the cross-stack logic - `parity/` is a path dependency of the
  app, and `lib/e2ee/e2ee.dart`, `lib/kt/key_transparency.dart`,
  `lib/ui/match/timeline_label.dart` re-export it, so the frozen vectors replay
  against the code the device actually ships (no hand-maintained fork)
- [~] On-device KAT replay - `app/integration_test/` (e2ee interop against the
  bundled NATIVE libsodium, chat identity, KT verify, sign-in, main-path e2e) is
  a MANUAL step (`mise run integration`): every spec left there needs a connected
  device/emulator, and all but the interop KAT also need a live server with a
  probe account. Deliberately NOT in `mise run gate`, so it only runs when someone
  runs it - a release ritual, written down in README.md. The device-independent
  half moved into the gate as `app/test/e2ee/roundtrip_test.dart` (system
  libsodium, headless).
- [x] End-to-end / UI-driving - `integration_test/main_path_test.dart`
  (`mise run e2e`) drives the real UI through sign in -> fixtures -> save a
  prediction -> reopen and see it persisted from the server. RUN AND GREEN on an
  x86_64 emulator against the isolated `e2e-up` stack, reproducible from a clean
  teardown via `e2e-up` + `e2e-seed`. It is the mobile answer to the web's
  Playwright layer, but one spec on the main path, and it needs an emulator plus
  a seeded live server, so it stays out of the unattended gate. It earned its
  keep immediately: it caught the per-league save route 400ing in NORMAL
  leagues, and a ref-after-dispose in the home shell.
- [~] Signed release build - a real release keystore exists and `apk-publish`
  refuses to publish without it. Play internal still needs a Play account.
- [~] Flutter gate (`mise run gate`) - sequential: model/i18n/KAT stale-checks,
  em-dash check, `flutter analyze`, `flutter test --coverage` + the coverage floor
  (app/test only), `dart test` (parity vectors), `flutter build apk --debug`.
  Repo has no hosted CI, so this is the by-hand gate. It is NOT equivalent to the
  web's `pnpm` gate:
  - it enforces a **98%** line floor (ratcheted up from the 60% it launched with)
    over `lib/` minus `lib/ui/**`, generated models and `main.dart` - the same bar
    as the web gate, but over a smaller scope
  - `app/integration_test/` never runs (see above)
  - the end-to-end spec is one main-path spec, and device+server gated (see above)
  - it needs a system libsodium (the parity e2ee interop KATs `dlopen` it) and an
    Android SDK; `mise install` provisions neither.
- [~] Widget test coverage - `lib/ui/**` is outside the coverage floor by design
  (as `app/pages` is on the web). Widget tests exist for smoke + crypto + auth +
  models + i18n + StatTile + Sessions (data/empty) + Map + Notifications
  (per-type template) + ShareCard; most `ui/` files still have none. Tracked in
  the root `TODO.md`.

## Genuinely external-blocked (not effort)
- Push (mobile FCM) = server FCM work + Firebase project

- Live chat/DM/voice round-trips = provisioned data / a 2nd participant
- Anything iOS / CallKit / APNs = no Apple hardware
