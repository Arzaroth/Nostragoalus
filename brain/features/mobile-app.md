# Mobile app (Flutter)

A **native second client** for the same server, not a webview wrapper. It lives
at [apps/mobile-flutter/](../../apps/mobile-flutter) and talks to the exact same
public HTTP API and WebSocket hub that the Nuxt app uses - no mobile-only
endpoints, no BFF. Roughly 50 screens and ~15k Dart lines.

The point is partly the product and partly the proof: an independent client in a
different language keeps the server contract honest. The two build-time
disciplines that make that possible are in
[../architecture/cross-stack-contract.md](../architecture/cross-stack-contract.md).

Status per feature is tracked in
[apps/mobile-flutter/PARITY.md](../../apps/mobile-flutter/PARITY.md) - that file,
not this one, is the up-to-date scoreboard. How to run and gate it is in
[apps/mobile-flutter/README.md](../../apps/mobile-flutter/README.md).

## Layout

| Path | What |
|---|---|
| `apps/mobile-flutter/app/` | The Flutter app. |
| `apps/mobile-flutter/parity/` | Pure-Dart runner replaying `shared/parity-json/` golden vectors. No Flutter, so `dart test` runs it anywhere. |
| `apps/mobile-flutter/.mise.toml` | The Dart/Flutter toolchain pin and every task, including the mobile gate. |

Inside `app/lib/`:

| Dir | What |
|---|---|
| `api/` | `dio` client + `models.gen.dart`, generated from `shared/contracts-openapi/` by `tool/gen_models.dart`. Never hand-edited. |
| `state/` | Riverpod providers, the app's answer to the web's vue-query composables. |
| `ui/` | 61 screen/widget files. |
| `chat/`, `e2ee/`, `kt/` | E2EE chat + DMs: group keys, sealed boxes, key transparency. Dart ports of `apps/web-nuxt/app/utils/e2ee.ts` and the KT chain. |
| `voice/` | WebRTC mesh over the same signaling the web app uses ([../architecture/webrtc.md](../architecture/webrtc.md)). |
| `live/` | The WS hub client ([../architecture/realtime.md](../architecture/realtime.md)). |
| `i18n/` | Reads `assets/i18n/*.json`, mirrored from `shared/i18n-json/`. Same five locales, same keys, RTL included. |
| `deeplink/` | Inbound `goal.arzaroth.com/...` App Links. |
| `auth/` | Identifier-first SSO: the browser round trip and the code exchange ([../architecture/auth.md](../architecture/auth.md)). |

## Three committed mirrors, all stale-checked

Nothing in the app is the source of truth for shared data. Three artifacts are
generated, committed, and re-checked by the gate:

- `app/lib/api/models.gen.dart` from `shared/contracts-openapi/`, via
  `tool/gen_models.sh`.
- `app/assets/i18n/*.json` from `shared/i18n-json/`.
- `app/assets/parity/*.json` from `shared/parity-json/`.

The two asset mirrors are produced by one parameterised script,
`app/tool/sync_shared.sh <shared-subdir> <assets-subdir> [--check]`. It wipes the
destination and re-copies the whole glob, so a removed vector disappears and an
added one appears. `--check` then asserts `git status --porcelain` is empty on
the destination - **not** `git diff`, which is blind to untracked files and would
let a newly added locale or KAT pass vacuously.

## The mobile gate

`mise run gate` from `apps/mobile-flutter/`. This repo has no hosted CI, so it is
run by hand, sequentially, aborting on the first failure: the three stale-checks,
the em-dash check (`app/tool/no_em_dash.sh` over `shared/i18n-json` and everything
tracked under `apps/mobile-flutter`), `flutter analyze`, `flutter test --coverage`
plus the coverage floor (`app/test/` only), `dart test` in `parity/`, then
`flutter build apk --debug`. The build step is the Android analogue of the web
gate's SSR build - it is what catches manifest-merger conflicts, minSdk/NDK bumps
pulled in by `flutter_webrtc`, plugin registration and Gradle failures. Debug
needs no keystore.

`app/tool/coverage_check.sh` sums `LF`/`LH` from the lcov and fails under **60%**
line coverage over `lib/` minus `lib/api/models.gen.dart` (generated),
`lib/ui/**` (screens/widgets, the analogue of `app/pages`, which the web gate
also leaves out) and `lib/main.dart`. 60 is what the suite measured (~63.5%) the
day the floor went in, not an aspiration; ratchet it up, never down.

It is **weaker than the web gate** and should not be described as matching it:

- 60% over the logic layers, against the web side's 98%
- `app/integration_test/` is device-gated and runs only via `mise run integration`
  (a release ritual - the specs left there need a device, and all but the native
  libsodium KAT replay also need a live server with a probe account)
- the UI-driving layer is one main-path spec, `mise run e2e`, not a Playwright
  suite, and it needs the emulator plus a seeded server
- it needs a system libsodium (the parity e2ee interop KATs `dlopen` it) and an
  Android SDK, neither of which `mise install` provisions.

The open debt is listed in the root `TODO.md` under "Mobile app".

## Platform notes

- Android release signs with a real keystore **when one is configured** -
  `android/key.properties` (gitignored) or `NG_ANDROID_KEYSTORE` +
  `NG_ANDROID_{STORE_PASSWORD,KEY_ALIAS,KEY_PASSWORD}`. The repo contains no
  keystore, so an unconfigured checkout falls back to the debug key purely so
  `flutter run --release` works. That fallback must never be the identity
  published in `assetlinks.json`: the debug keystore ships with every Android
  SDK, so anyone could then claim `goal.arzaroth.com`'s links. There is still no
  Play account.
- **Deep links are verified App Links**, not a custom scheme. The manifest
  autoVerify's `https://goal.arzaroth.com` (all paths, for share/league/match
  links) and `/mobile/sso-callback` on `flutter_web_auth_2`'s CallbackActivity.
  Verification needs `/.well-known/assetlinks.json`, served by the Nuxt app from
  `NUXT_ANDROID_CERT_FINGERPRINTS` (404 while unset - Android then falls back to
  the link chooser). The old `nostragoalus://` scheme is gone: a private scheme
  is claimable by any installed app, which an auth callback must not be.
- iOS claims the same domain through `ios/Runner/Runner.entitlements`
  (`applinks:goal.arzaroth.com`, wired into all three Runner build configs) plus
  `/.well-known/apple-app-site-association` from `NUXT_IOS_APP_IDS`. Both are
  written blind: there is no Team ID to put in the association file and no way to
  verify either one (next bullet).
- The Flutter template declares `INTERNET` only in `src/debug` and `src/profile`,
  so the main manifest declares it explicitly or a release APK cannot reach the
  server at all.
- iOS is configured (usage-description strings, associated domains) but unbuilt
  and unverified: nobody on the project has Apple hardware. That is also why
  CallKit, APNs and passkeys are unstarted rather than deferred.
- Permissions in the merged release manifest are `INTERNET`, `RECORD_AUDIO`,
  `MODIFY_AUDIO_SETTINGS`, `ACCESS_NETWORK_STATE` (all WebRTC voice) plus
  `BLUETOOTH`, merged transitively by `flutter_webrtc` for headset routing.
  `image_picker` needs none - Android's photo picker is permissionless. There is
  deliberately **no** `FOREGROUND_SERVICE*`, `MANAGE_OWN_CALLS` or
  `DISABLE_KEYGUARD`: see the background-audio decision below.

## Calls and the app lifecycle

A call lives only while the app is in the foreground. `HomeShell`'s
`AppLifecycleListener` calls `VoiceService.backgrounded()` on `onPause` (and
`leave()` on `onDetach`), which tears the call down with reason
`VoiceEndReason.backgrounded`; on the way back the shell tells the user why
(`voice.endedInBackground`). Without a foreground service the OS suspends the
microphone as soon as the app leaves the foreground, so any grace period would be
a window where the UI claims "in call" over a dead mic - and the server would be
holding a zombie room member. Ending is the honest option; the rationale and what
a real background-call feature would cost is in
[../decisions.md](../decisions.md).

## Decisions

Why Flutter and not Tauri/Capacitor, and why the app carries its own crypto
ports: see [../decisions.md](../decisions.md).
