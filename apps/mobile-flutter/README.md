# Nostragoalus mobile (Flutter)

A native client for the Nostragoalus score-prediction game, talking to the same
server as the Nuxt web app (`apps/web-nuxt/`) over its public HTTP API and its
WebSocket hub. Roughly 50 screens: fixtures and picks, leaderboards, leagues,
E2E-encrypted chat and DMs, WebRTC voice, achievements, analytics, roadmap.

Two Dart packages live here:

| Dir | What it is |
|---|---|
| `app/` | The Flutter app (Riverpod state, dio API client, `sodium` for E2EE). |
| `parity/` | Pure-Dart runner replaying the frozen cross-stack golden vectors in `shared/parity-json/`, proving the Dart ports of scoring/standings/fergie/commitment/KT/E2EE match the TS server bit for bit. See `brain/architecture/cross-stack-contract.md`. |

Feature-by-feature status against the web app lives in [PARITY.md](PARITY.md) -
that is the honest progress board, read it before assuming something works.

## Prerequisites

- `mise install` in this directory provisions Dart + Flutter (`.mise.toml`).
- **A system libsodium.** `parity/test/e2ee_interop_test.dart` `dlopen`s
  `libsodium.so.*` and throws when it is missing, so `mise run gate` fails for an
  environment reason on a clean machine. Install your distro's package
  (`libsodium` / `libsodium23` / `libsodium-dev`); `mise` does not provide it.
- **An Android SDK** (`ANDROID_HOME`, platform-tools, a build-tools version) for
  the gate's APK step. `flutter doctor` tells you what is missing.
- iOS builds need macOS + Xcode, which nobody on this project has. The iOS
  target is configured but unbuilt and unverified.

## Running it

```
cd app && flutter run
```

Point it at a server with `--dart-define=API_BASE=...` / `--dart-define=WEB_BASE=...`
(see `app/lib/config.dart` for the defaults). `mise run dev` at the repo root
brings up the local web stack if you want to run against that instead of prod.

## The gate

`mise run gate` (from `apps/mobile-flutter/`) is the by-hand gate - this repo has
no hosted CI. Steps run sequentially and it aborts on the first failure:

| Step | What it catches |
|---|---|
| `gen_models.sh` + `git diff --exit-code lib/api/models.gen.dart` | The OpenAPI snapshot moved and the generated Dart models are stale. |
| `sync_shared.sh i18n-json i18n --check` | The bundled locales drifted from `shared/i18n-json` (added, removed or edited). |
| `sync_shared.sh parity-json parity --check` | Same for the frozen KATs in `shared/parity-json`. |
| `flutter analyze` | Static analysis, including the `strict-casts` / `strict-raw-types` and `avoid_print` settings in `app/analysis_options.yaml`. |
| `flutter test` | `app/test/` only - unit + widget tests. |
| `dart test` (in `parity/`) | Cross-stack golden vectors. Needs libsodium. |
| `flutter build apk --debug` | The Android build class the other steps miss: manifest merger conflicts, minSdk/NDK bumps from `flutter_webrtc`, plugin registration, Gradle and resource failures. Debug needs no keystore. |

Both mirror checks use `git status --porcelain`, not `git diff`, because `git
diff` is blind to untracked files and a newly added locale or KAT would sail
through.

### What the gate does NOT cover

- **No coverage measurement at all.** No `--coverage`, no threshold. The web side
  enforces 98%; here the number is simply unknown, and most of `app/lib/` has no
  test. Tracked in the root `TODO.md`.
- `app/integration_test/` (see below).
- Anything UI-driving end to end. There is no Playwright equivalent.
- iOS, in any form.

## On-device integration tests

```
mise run integration      # needs a connected device or emulator
```

`app/integration_test/` is the only on-device proof of the E2EE round-trip, chat
identity, key-transparency verification and sign-in. `flutter test` with no path
runs `test/` only, so these never run in the gate - this is a manual step. Check
`flutter devices` first.

## Codegen and mirrors

| Task | What it does |
|---|---|
| `mise run gen-models` | Regenerates `app/lib/api/models.gen.dart` from `shared/contracts-openapi/`. |
| `mise run i18n-sync` | Copies `shared/i18n-json/*.json` into `app/assets/i18n/`. |
| `mise run parity-sync` | Copies `shared/parity-json/*.json` into `app/assets/parity/`. |

All three outputs are committed and stale-checked by the gate. Never hand-edit
them; edit the source in `shared/` and re-run the task. `app/tool/sync_shared.sh
<shared-subdir> <assets-subdir> [--check]` backs both mirror tasks: it wipes the
destination and re-copies the whole glob, so removed files disappear and added
ones appear.

Dependencies change through `flutter pub add` / `flutter pub remove`, never by
hand-editing `pubspec.yaml` - the same rule as `pnpm` on the web side.

## Known gaps

- **Release builds are signed with the DEBUG key**
  (`app/android/app/build.gradle.kts`). There is no upload keystore and no Play
  account. A debug-signed `app-release.apk` must never be handed to a tester as
  "the release build": it is not installable over a properly signed build, it
  carries debuggable-adjacent expectations, and its signature proves nothing.
  Anything shared with anyone is a debug build until a real keystore exists.
- No coverage measurement, and most of `app/lib/` is untested (see above).
- CallKit / background call UI / ring push is not wired. The
  `flutter_callkit_incoming` dependency was removed: nothing but dead spike code
  imported it, while it merged `MANAGE_OWN_CALLS`, `USE_FULL_SCREEN_INTENT`,
  `DISABLE_KEYGUARD` and friends into the shipped release manifest for a feature
  that does not exist. Re-add it when the feature is actually built.
- Mobile push (FCM/APNs) needs new server endpoints; the server speaks only
  web-push/VAPID today.
- Passkeys, and everything iOS. See [PARITY.md](PARITY.md) for the full list.
