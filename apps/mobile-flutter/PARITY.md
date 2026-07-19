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
- [~] SSO sign in - email-domain detection + better-auth web-auth flow + Android
  callback scheme. `[!]` completing it needs `nostragoalus` in
  NUXT_SSO_TRUSTED_ORIGINS + an iOS URL type + a real IdP
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
- [x] Fixtures list
- [x] Standings (group tables)
- [x] Scorers + assists table (competition)
- [x] Leaderboard (+ movement arrow)
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
- [x] Crowd predictions view - consensus card under the prediction input (show-crowd pref)

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
- [x] Chat rich: reactions + report + edit + moderator dashboard + @-mentions +
  E2EE image attachments + threads + presence dots + typing indicator; `[!]` delete
  (no own-message delete endpoint - edit only)
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
- [!] CallKit / background audio / ring push - iOS-only (no Apple)

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
- [x] i18n mirror + stale-check; parity KAT mirror + on-device replay
- [!] Signed release build + Play internal (needs an upload keystore + a Play account)
- [x] Flutter gate (`mise run gate`) - stale-checks (models/i18n/KAT mirrors) +
  analyze + app tests + cross-stack parity, sequential. Repo has no hosted CI;
  this is the by-hand gate matching the web's `pnpm` gate.
- [x] Widget test coverage - smoke + crypto + auth + models + i18n + StatTile +
  Sessions (data/empty) + Map + Notifications (per-type template) + ShareCard
  (33 tests); more per-screen specs can always be added

## Genuinely external-blocked (not effort)
- Push (mobile FCM) = server FCM work + Firebase project
- SSO completion = trusted-origin config + real IdP
- Live chat/DM/voice round-trips = provisioned data / a 2nd participant
- Anything iOS / CallKit / APNs = no Apple hardware
- Best-scorer pick = no player-id in the public contract
