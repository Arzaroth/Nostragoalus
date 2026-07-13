# Nostragoalus mobile (Flutter) - build roadmap

The native Flutter client. Spine: contract-driven API (models generated from
`shared/contracts-openapi/openapi.snapshot.json`), parity-verified pure logic
(Dart ports checked against `shared/parity-json` by `parity/`), shared locales
(`shared/i18n-json`, 1753 keys), better-auth `bearer` auth. Lives under
`apps/mobile-flutter/{app,parity}`.

> No Flutter SDK in the authoring env: code here is authored, not compiled. Run
> `flutter pub get` + the probes on a machine with the Flutter SDK; the voice +
> push spikes need real devices (CallKit / APNs / a TURN relay). Treat first
> `flutter run` / `flutter test` as the real validation.

Legend: `[ ]` todo `[~]` in progress `[x]` done `[!]` blocked/needs-device

## Phase 0 - De-risk spike (go/no-go)
The three things that can't be worked around. All green -> proceed.
Authored on a machine without the Flutter SDK - `[~]` = code written, needs a
`flutter`/`dart` run to verify (first run may need small API-nit fixes).

- [x] **Server prerequisite** - `bearer()` plugin enabled in `apps/web-nuxt/lib/auth.ts`. Contract PROVEN in-process by `apps/web-nuxt/tests/bearer-token-auth.test.ts` (sign-in -> `set-auth-token` header -> `Authorization: Bearer` -> authed get-session, no cookie). MUST still be deployed before an on-device probe hits a real server.
- [~] **Scaffold** `apps/mobile-flutter/app` - pubspec + `lib/{config,main}.dart` + spike launcher authored. Pending: `flutter create .` (platform dirs) + `flutter pub get`.
- [~] **Auth probe** (`lib/spike/auth_probe.dart`) - bearer login + secure-storage token + authed GET /api/me/trust-status. The bearer HTTP contract it rests on is proven (see the server-prereq test); the remaining leg is only the Flutter/dio packaging: `flutter run` on an emulator against a bearer-enabled server. Blocked here on Flutter SDK + emulator + a deployed server.
- [!] **Voice probe** (`lib/spike/voice_probe.dart`) - WebRTC + CallKit + `_ws.ts` signaling SKELETON. Needs the on-device build-out (2 real devices + coturn; mirror `voice.ts`).
- [x] **E2EE interop probe** - `e2ee.ts` ported to `parity/lib/e2ee.dart` (sodium ffi, SUMO API for Argon2id pwhash) + `parity/test/e2ee_interop_test.dart` replays the frozen `shared/parity-json/e2ee.json` KATs. GREEN: 24 KATs pass against system libsodium (`mise run e2ee-interop`); Dart reproduces the web's decrypt/derive byte-for-byte.
- [ ] **Decision** - record spike outcome; adjust scope if any red

## Phase 1 - MVP core loop (ship to TestFlight / Play internal)
- [ ] Contract codegen wired (`tool/gen_models.sh` -> `lib/api/`), stale-check
- [ ] API client (dio + bearer interceptor + generated models), riverpod query layer (hierarchical keys, invalidate-on-mutation, staleTime)
- [ ] i18n loader over `shared/i18n-json` (5 locales, RTL)
- [ ] Auth flow (sign in / session / sign out)
- [ ] Competition browse + switcher
- [ ] Fixtures list + match detail
- [ ] Make / edit prediction + joker
- [ ] Leaderboard + my-predictions
- [ ] Internal build published (TestFlight / Play internal)

## Phase 2 - Social + realtime-read
- [ ] Leagues: browse / join / board (movement, crown, live)
- [ ] Notifications: in-app center + push (FCM + APNs), server sender beside web-push
- [ ] Live scores over WS (subscribe, reconnect)
- [ ] Reactions
- [ ] Read-only: achievements, analytics, wrapped

## Phase 3 - E2EE messaging (gated by Phase 0 e2ee)
- [ ] Dart `e2ee` port (parity-verified) - the full crypto module
- [ ] League chat (send / receive / history)
- [ ] DMs (1:1)
- [ ] Key transparency + safety numbers
- [ ] Recovery-code flow

## Phase 4 - Voice + native polish (gated by Phase 0 voice)
- [ ] WebRTC voice: DM 1:1
- [ ] WebRTC voice: league rooms (mesh, N-in-voice)
- [ ] CallKit background audio + ring / missed-call push
- [ ] OS share (`share_plus`)
- [ ] Deep links
- [ ] Live-viewers

## Phase 5 - Long-tail parity
- [ ] Multiview grid
- [ ] Tamper-evidence `/verify`
- [ ] Best-scorer + champion picks
- [ ] Bot personas
- [ ] Past-pick counterfactual
- [ ] Roadmap view
- [ ] SSO login (OIDC via `flutter_web_auth_2`)
- [ ] (Admin + SSO-config stay web-only; satori share-images shown/shared as URL)

## Cross-cutting (stand up in Phase 0/1)
- [ ] Parity CI: `dart test` replays `shared/parity-json`; job runs TS `parity:bless` then Dart replay (no drift)
- [ ] Contract CI: regenerate Dart models from the snapshot, fail on stale
- [ ] Per-app `apps/mobile-flutter/.mise.toml` (flutter/dart toolchain + tasks)
- [ ] Path-scoped CI (a Dart change doesn't run the web gate, and vice-versa)
