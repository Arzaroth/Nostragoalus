# Nostragoalus mobile (Flutter) - build roadmap

The native Flutter client. Spine: contract-driven API (models generated from
`shared/contracts-openapi/openapi.snapshot.json`), parity-verified pure logic
(Dart ports checked against `shared/parity-json` by `parity/`), shared locales
(`shared/i18n-json`, 1753 keys), better-auth `bearer` auth. Lives under
`apps/mobile-flutter/{app,parity}`.

> Build env now has the Flutter SDK (3.44.6 via mise) + JDK 17/21 + Android SDK,
> and a real device over adb: `flutter build`, `flutter test`, and on-device
> probes all run here. The voice + push spikes still need extra hardware
> (2 devices + a Mac / TURN relay; APNs).

Legend: `[ ]` todo `[~]` in progress `[x]` done `[!]` blocked/needs-device

## Phase 0 - De-risk spike (go/no-go) - CLOSED 2026-07-14: GO
The three things that can't be worked around. Verdict: GO (see below) - both
existential risks (E2EE decrypt parity, stateless bearer auth) retired, plus full
logic parity. Device/SDK-bound legs (Flutter UI, voice-on-device) carry forward as
execution, not open questions. Authored on a machine without the Flutter SDK -
`[~]` = code written, first `flutter`/`dart` run may need small API-nit fixes.

- [x] **Server prerequisite** - `bearer()` plugin enabled in `apps/web-nuxt/lib/auth.ts`. Contract PROVEN in-process by `apps/web-nuxt/tests/bearer-token-auth.test.ts` (sign-in -> `set-auth-token` header -> `Authorization: Bearer` -> authed get-session, no cookie). MUST still be deployed before an on-device probe hits a real server.
- [~] **Scaffold** `apps/mobile-flutter/app` - pubspec + `lib/{config,main}.dart` + spike launcher authored. Pending: `flutter create .` (platform dirs) + `flutter pub get`.
- [~] **Auth probe** (`lib/spike/auth_probe.dart`) - bearer login + secure-storage token + authed GET /api/me/trust-status. The bearer HTTP contract it rests on is proven (see the server-prereq test); the remaining leg is only the Flutter/dio packaging: `flutter run` on an emulator against a bearer-enabled server. Blocked here on Flutter SDK + emulator + a deployed server.
- [!] **Voice probe** (`lib/spike/voice_probe.dart`) - WebRTC + CallKit + `_ws.ts` signaling SKELETON. Needs the on-device build-out (2 real devices + coturn; mirror `voice.ts`). Re-spiked at Phase 4 entry - NOT a go/no-go blocker (see Decision).
- [x] **E2EE interop probe** - `e2ee.ts` ported to `parity/lib/e2ee.dart` (sodium ffi, SUMO API for Argon2id pwhash) + `parity/test/e2ee_interop_test.dart` replays the frozen `shared/parity-json/e2ee.json` KATs. GREEN: 24 KATs pass against system libsodium (`mise run e2ee-interop`); Dart reproduces the web's decrypt/derive byte-for-byte.
- [x] **Decision - GO.** Recorded 2026-07-14. See verdict below.

### Decision verdict (2026-07-14): GO

The two existential unknowns that could have killed Flutter are both retired:

1. **Can a Dart client decrypt what the web app E2EE-wrote?** YES - 24 e2ee KATs
   pass byte-for-byte (libsodium SUMO / Argon2id). The whole chat/DM/voice-key
   story rests on this; it was the crown-jewel risk and it's green.
2. **Can a native client authenticate against our better-auth server without the
   cookie session?** YES - the `bearer()` token contract is proven in-process
   (`apps/web-nuxt/tests/bearer-token-auth.test.ts`): sign-in -> `set-auth-token`
   -> `Authorization: Bearer` -> authed session, no cookie.

Bonus retired risk: **logic drift.** All pure logic (scoring, fergie, standings,
consensus, commitment, key-transparency, match, e2ee) is parity-verified against
the frozen `shared/parity-json` vectors - 104 cases green via `mise run parity`.
The mobile client reimplements no scoring/ranking logic blind; the vectors are the
contract, replayed on both stacks.

**Not blockers to GO** (execution deferred, no Flutter SDK / emulator / devices in
the authoring env):
- Flutter UI packaging of the auth probe (dio around the proven HTTP calls) - runs
  at the first `flutter run`, folded into Phase 1.
- The `flutter create .` scaffold (platform dirs) - Phase 1 first-run.
- **Voice mesh on-device** - genuinely unproven, but it's proven *technology*
  (`flutter_webrtc` + `flutter_callkit_incoming` are mature; our WS signaling hub
  is transport-agnostic and already carries the web mesh). The open risk is
  CallKit / iOS background-audio integration, which is Phase 4 *build* risk, not a
  "can Flutter do this at all" unknown. Re-spike with 2 devices + a Mac at Phase 4
  entry; if it reds there, Phase 4 descopes to push-only, everything else ships.

Scope unchanged. Proceed to Phase 1 on a Flutter machine.

## Phase 1 - MVP core loop (ship to TestFlight / Play internal)
- [x] Bootstrap on a Flutter machine: `flutter create .` + `flutter pub get`, auth probe GREEN on a real device (Samsung SM A556E, Android 16). flutter 3.44.6 + JDK 17/21 via mise; gradle foojay resolver auto-provisions the JDK 17 that flutter_callkit_incoming pins; plugin modules forced to compileSdk 36 (flutter_webrtc pins 31). On-device signal is the headless logcat entrypoint - DDS is flaky over wireless adb.
- [x] Contract codegen wired (`tool/gen_models.sh` -> `lib/api/models.gen.dart`), `mise run models-check` stale-check. The snapshot inlines every schema (no components/$ref); the generator dedups identical inline shapes.
- [x] API client (dio + bearer interceptor + generated models), riverpod query layer (kept-alive reads, invalidate-on-mutation). staleTime parity approximate; competition/league query-scoping deferred (routes are session/cookie-scoped server-side).
- [x] i18n loader over `shared/i18n-json` (5 locales, RTL) - dotted-key lookup + `{var}` interpolation + English fallback, `I18nScope`/`context.tr`, locale switcher.
- [x] Auth flow (sign in / session / sign out) - bearer session, gated app shell; sign-in flow green on the emulator.
- [~] Competition browse + switcher - matches/standings/leaderboard render the session's active competition; an explicit switcher needs a server-side scoping param (routes are cookie/session-scoped, no query). Deferred with the API-client note.
- [x] Fixtures list + match detail
- [x] Make / edit prediction + joker - score + outcome-only + wager via the league PUT, joker via `PUT /api/leagues/{id}/joker`.
- [x] Leaderboard + my-predictions
- [~] Internal build published (TestFlight / Play internal) - debug + native build proven on device + emulator; a signed release appbundle needs an upload keystore + a Play account (owner action).

## Phase 2 - Social + realtime-read
- [x] Leagues: browse / join / board - my leagues, public browse, join by code / id, mode-board (points/survival union rendered leniently).
- [~] Notifications: in-app center done (bell + unread badge + mark-all-read). Push (FCM + APNs + a server sender beside web-push) is deferred - needs a Firebase project, an APNs cert, and server work.
- [x] Live scores over WS (subscribe, reconnect) - bearer-authenticated hub connection, invalidates the reads each frame touches.
- [x] Reactions - emoji bar on match detail (6 emoji, live counts).
- [~] Read-only: analytics + wrapped shipped. Achievements deferred (no obvious list endpoint in the snapshot; the leaderboard already carries the showcase).

## Phase 3 - E2EE messaging (gated by Phase 0 e2ee)
- [~] Dart `e2ee` port (parity-verified) - the DECRYPT/derive half is ported into
  the app (`lib/e2ee/e2ee.dart`) and GREEN on the emulator against the frozen KATs
  with native libsodium. The ENCRYPT/seal half (needed to send) is still unported
  (it's random, so no KAT freezes it - it needs its own test strategy).
- [ ] League chat (send / receive / history) - receive/decrypt is unblocked by the
  module, but exercising it end-to-end needs a provisioned E2EE identity + group
  keys on the dev stack (none seeded); send additionally needs the encrypt port.
  Deferred until those two are in place.
- [ ] DMs (1:1) - same crypto + provisioning gap as league chat.
- [~] Key transparency + safety numbers - the safety-number derivation
  (`fingerprint`) is ported + proven; the KT-log fetch/verify UI is deferred.
- [~] Recovery-code flow - `unwrapPrivateKeyWithRecovery` is ported + proven; the
  interactive recovery screen is deferred (needs the provisioned identity blob).

## Phase 4 - Voice + native polish (gated by Phase 0 voice)
- [ ] WebRTC voice: DM 1:1 - hardware-gated (two real devices + the coturn relay);
  the signaling rides the existing WS hub (voice:* frames) but the audio path
  can't be exercised on a single emulator. Deferred to a device session.
- [ ] WebRTC voice: league rooms (mesh, N-in-voice) - same hardware gate.
- [ ] CallKit background audio + ring / missed-call push - needs iOS + a Mac +
  real devices; also depends on the push slice (Phase 2). Deferred.
- [x] OS share (`share_plus`) - share a match link from the detail screen.
- [~] Deep links - the app produces `goal.arzaroth.com/matches/{id}` share links;
  inbound deep-link handling (intent-filters + iOS assoc + route parsing) is a
  later slice.
- [x] Live-viewers - the detail screen keeps its hub room subscribed and shows the
  live `viewers:update` count.

## Phase 5 - Long-tail parity
- [ ] Multiview grid - deferred (a live-match tile grid; a UI-composition slice).
- [ ] Tamper-evidence `/verify` - deferred (commit-reveal ledger read; the crypto
  hashing is already parity-proven, only the read UI is missing).
- [~] Best-scorer + champion picks - champion pick shipped (set + tiered points,
  locks with the competition); best-scorer has its read layer wired, screen deferred.
- [ ] Bot personas - deferred (read of the bot leaderboard rows / predictions).
- [ ] Past-pick counterfactual - deferred (`/api/matches/{id}/my-past-picks` read).
- [x] Roadmap view - public items by status with community upvotes.
- [ ] SSO login (OIDC via `flutter_web_auth_2`) - deferred; needs the browser-auth
  dep + a configured SSO provider to exercise.
- [ ] (Admin + SSO-config stay web-only; satori share-images shown/shared as URL)

## Cross-cutting (stand up in Phase 0/1)
- [ ] Parity CI: `dart test` replays `shared/parity-json`; job runs TS `parity:bless` then Dart replay (no drift)
- [ ] Contract CI: regenerate Dart models from the snapshot, fail on stale
- [ ] Per-app `apps/mobile-flutter/.mise.toml` (flutter/dart toolchain + tasks)
- [ ] Path-scoped CI (a Dart change doesn't run the web gate, and vice-versa)
