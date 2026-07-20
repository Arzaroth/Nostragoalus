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
| `deeplink/` | Inbound `goal.arzaroth.com/...` App Links plus the `nostragoalus://` SSO callback scheme. |

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
`flutter analyze`, `flutter test` (`app/test/` only), `dart test` in `parity/`,
then `flutter build apk --debug`. The build step is the Android analogue of the
web gate's SSR build - it is what catches manifest-merger conflicts, minSdk/NDK
bumps pulled in by `flutter_webrtc`, plugin registration and Gradle failures.
Debug needs no keystore.

It is **weaker than the web gate** and should not be described as matching it:

- it measures no coverage and enforces no threshold (the web side enforces 98%)
- `app/integration_test/` is device-gated and runs only via `mise run integration`
- there is no UI-driving end-to-end layer (no Playwright equivalent)
- it needs a system libsodium (the parity e2ee interop KATs `dlopen` it) and an
  Android SDK, neither of which `mise install` provisions.

The open debt is listed in the root `TODO.md` under "Mobile app".

## Platform notes

- Android release currently signs with the **debug key** - no upload keystore, no
  Play account. A debug-signed APK is never "the release build".
- The Flutter template declares `INTERNET` only in `src/debug` and `src/profile`,
  so the main manifest declares it explicitly or a release APK cannot reach the
  server at all.
- iOS is configured (usage-description strings, URL scheme) but unbuilt and
  unverified: nobody on the project has Apple hardware. That is also why CallKit,
  APNs and passkeys are unstarted rather than deferred.
- Permissions in the merged release manifest are `INTERNET`, `RECORD_AUDIO`,
  `MODIFY_AUDIO_SETTINGS`, `ACCESS_NETWORK_STATE` (all WebRTC voice) plus
  `BLUETOOTH`, merged transitively by `flutter_webrtc` for headset routing.
  `image_picker` needs none - Android's photo picker is permissionless.

## Decisions

Why Flutter and not Tauri/Capacitor, and why the app carries its own crypto
ports: see [../decisions.md](../decisions.md).
