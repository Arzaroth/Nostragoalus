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
- [ ] Two-factor (2FA enrol / verify / recovery)
- [ ] Email verification flow
- [ ] Passkeys
- [x] Connected sessions / devices (list + revoke)
- [ ] Confirm-credentials / revoke-trust
- [x] Preferences: show-crowd, show-odds, light/dark/system theme
- [~] Account home - identity + links; no edit name/avatar
- [x] Locale switch (5 locales, RTL) - `[ ]` not yet persisted to the server profile

## Competition
- [x] Competition browse + switcher (all scoped reads honor it)
- [x] Fixtures list
- [x] Standings (group tables)
- [x] Scorers + assists table (competition)
- [x] Leaderboard (+ movement arrow)
- [x] Multiview grid (live matches)
- [x] Champion pick (FIFA-tiered)
- [~] Best-scorer - read (pick + top scorers); `[ ]` interactive pick (no player-id
  in the contract)
- [x] Bot personas (per-match bot predictions)
- [~] Wrapped - headline totals; `[ ]` full recap
- [x] Analytics - headline tiles + tier bars, goals/outcome lean, home-bias +
  draw-gap, team over/under-rate, accuracy-by-round, best/worst call, Fergie-time,
  current+best streak
- [x] Teams list (competition-scoped)
- [x] Bracket (knockout tree)
- [ ] Map (host cities / group map - Leaflet on web)
- [x] Compare (player head-to-head) - self vs a leaderboard opponent: points,
  win/tie record, agreement, over-time, divergences

## Match detail (tabs)
- [x] Prediction + joker (score, outcome-only, wager)
- [x] Reactions (6-emoji bar)
- [x] Past-pick counterfactual
- [x] Timeline (play-by-play)
- [x] Lineups (formation + XI)
- [x] Scorers/assists (match)
- [~] Insights - h2h count + possession; `[ ]` form/goals/standings/next detail
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
- [~] League board (points/survival mode-board)
- [x] League detail: members, role, mode
- [x] Create league
- [~] Invites (create / list / delete); `[ ]` accept-link (inbound deep link)
- [x] Leave league / transfer ownership / member management (promote, demote, kick)
- [x] Rewards / prizes (per-league criteria + ranking drill-in bottom sheet)
- [ ] Featured team / team specialist (admin edit)
- [x] Regenerate join code
- [ ] Per-league nudge / prompt

## Messaging (E2EE)
- [x] Crypto module - encrypt + decrypt, proven on-device vs the frozen KATs
- [x] Identity bootstrap (generate / register / restore)
- [x] Recovery-code flow (unlock gate + set-up)
- [x] Key-transparency verify + safety number
- [~] League chat - send / receive / history + message reactions; `[!]` live message
  round-trip needs a provisioned multi-member league (a keyholder to seal keys)
- [~] DMs (1:1) - inbox / room / create; `[!]` live round-trip needs a 2nd user
- [ ] Chat rich: threads, mentions, images, edit/delete, moderation, presence, typing
- [ ] DM rich: read receipts, reactions, images
- [ ] Identity reset

## Realtime & voice
- [x] Live scores over WS (subscribe, invalidate, reconnect)
- [x] Live viewers count (per match)
- [~] WebRTC voice mesh (league rooms) - full signaling + mesh; `[!]` audio-through
  needs two participants
- [~] Voice DM 1:1 - scope supported; `[ ]` ring / decline / missed-call UI
- [!] CallKit / background audio / ring push - iOS-only (no Apple)

## Notifications
- [x] In-app notification center (bell + unread badge + mark-all-read)
- [ ] Per-type message templates (currently humanised enum)
- [!] Push (FCM Android) - the server exposes only web-push/VAPID; mobile FCM needs
  NEW server endpoints (device-token registration + sender) + a Firebase project
- [!] Push (APNs) - no Apple

## Achievements / stats / rewards
- [~] Trophy cabinet (trophies + earned achievements) - own + other users; `[ ]`
  tiers / rarity / criteria-progress detail, showcase pin/edit
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
- [ ] Onboarding tour
- [ ] Deep links (inbound `goal.arzaroth.com/...`)
- [x] Feed subscription (calendar) - subscribe (webcal) / copy / regenerate
- [ ] Share-token landing pages (a/p/s/[token] - analytics/profile/wrapped shares)
- [x] App launcher name + icon + native splash (indigo brand, held to first frame)

---

## Cross-cutting
- [x] OpenAPI model codegen + stale-check
- [x] i18n mirror + stale-check; parity KAT mirror + on-device replay
- [ ] Signed release build + Play internal (needs an upload keystore + a Play account)
- [ ] Flutter CI job (analyze + test + models/i18n stale-check)
- [ ] Widget/integration test coverage across screens (only smoke + crypto + auth
  flows tested today)

## Genuinely external-blocked (not effort)
- Push (mobile FCM) = server FCM work + Firebase project
- SSO completion = trusted-origin config + real IdP
- Live chat/DM/voice round-trips = provisioned data / a 2nd participant
- Anything iOS / CallKit / APNs = no Apple hardware
- Best-scorer pick = no player-id in the public contract
