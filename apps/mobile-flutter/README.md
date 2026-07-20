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
| `no_em_dash.sh` | The em-dash character in `shared/i18n-json/` or anywhere tracked under `apps/mobile-flutter`. The repo rule was a convention nobody could enforce; four locale strings had drifted. |
| `flutter analyze` | Static analysis, including the `strict-casts` / `strict-raw-types` and `avoid_print` settings in `app/analysis_options.yaml`. |
| `flutter test --coverage` + `coverage_check.sh` | `app/test/` only - unit + widget tests, plus a line-coverage floor (see below). |
| `dart test` (in `parity/`) | Cross-stack golden vectors. Needs libsodium. |
| `flutter build apk --debug` | The Android build class the other steps miss: manifest merger conflicts, minSdk/NDK bumps from `flutter_webrtc`, plugin registration, Gradle and resource failures. Debug needs no keystore. |

Both mirror checks use `git status --porcelain`, not `git diff`, because `git
diff` is blind to untracked files and a newly added locale or KAT would sail
through.

### The coverage floor

`app/tool/coverage_check.sh` sums `LF`/`LH` out of the lcov `flutter test
--coverage` writes and fails under **60%** line coverage. It is scoped the way
the web gate scopes its 98%: logic layers only.

| Excluded | Why |
|---|---|
| `lib/api/models.gen.dart` | Generated from the OpenAPI snapshot; the gate's stale-check is its proof, not a test. |
| `lib/ui/**` | Screens and widgets - the mobile analogue of `apps/web-nuxt/app/pages`, which the web gate leaves out of its scope too. Widget tests still run, they just do not count toward the floor. |
| `lib/main.dart` | `runApp` + platform bootstrap. |

60% is not 98%. It is what the suite honestly measured (~63.5%) when the floor
went in, set just under so an unrelated file addition does not turn the gate red
for nothing. Ratchet it up as the suite grows; never lower it to make a red gate
green. `mise run coverage` runs the same thing standalone, and `bash
tool/coverage_check.sh 70` tries a candidate floor without editing anything.

### What the gate does NOT cover

- `lib/ui/**` in the coverage floor (widget tests run, they just do not gate).
- `app/integration_test/` (see below) - device- and server-bound by definition.
- iOS, in any form.

## On-device tests

Everything under `app/integration_test/` needs a **connected device or emulator**,
and all but one also need a **live server** with a probe account. `flutter test`
with no path runs `test/` only, so none of it runs in the gate - it is a manual
step, and the honest name for it is a release ritual. Check `flutter devices`
first.

| Spec | Needs | What it proves |
|---|---|---|
| `e2ee_interop_test.dart` | device | The app's e2ee module replays the frozen TS KATs against the **native** libsodium bundled by `sodium_libs`, not the system lib the gate uses. |
| `chat_identity_test.dart` | device + server | Chat identity generates, registers with `/api/chat/identity` and persists. |
| `kt_verify_test.dart` | device + server | The server's key-transparency hash chain re-verifies and yields a safety number. |
| `sign_in_flow_test.dart` | device + server | Sign in lands on the home shell. |
| `main_path_test.dart` | device + server | The main path end to end (see below). |

The device-independent half of that suite now runs in the gate:
`app/test/e2ee/roundtrip_test.dart` (moved out of `integration_test/`) proves the
encrypt/seal half by round-tripping it through the KAT-verified decrypt half,
headless, via the same system-libsodium `DynamicLibrary` helper the parity runner
uses.

```
mise run integration      # all of it
mise run e2e              # just the main-path spec
```

### The end-to-end spec

`integration_test/main_path_test.dart` is the mobile answer to the web's
Playwright layer: it drives the real UI through sign in -> the fixtures list ->
bump a score and save -> leave the match, reopen it and see the pick come back
**from the server**. Deliberately one spec on the main path, not a suite.

It cannot run unattended: it needs an emulator and a live server, so it is a
by-hand step. This is the ritual:

```
mise run dev                                    # repo root: the local web stack
flutter emulators --launch duogo_test           # or any x86_64 AVD
mise run e2e -- -d emulator-5554 \
  --dart-define=API_BASE=http://10.0.2.2:3001 \
  --dart-define=PROBE_EMAIL=probe@example.com \
  --dart-define=PROBE_PASSWORD='Probe-Password123!'
```

`10.0.2.2` is the host as seen from inside the Android emulator. The probe
account must be a member of at least one league in the default competition, or
the prediction editor renders `picks.noLeagueForCompetition` and the spec fails
on a fixture problem rather than a real one.

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

Every one of those stale-checks is already a `mise run gate` step, so there is no
task that only ever runs when someone remembers it: `models-check`, `i18n-check`,
`parity-check` and `em-dash-check` are the standalone spellings of gate steps,
useful while iterating, redundant at merge time.

## If this ever gets CI

There is no hosted CI, by choice - `mise run gate` is the gate, run by hand
before a merge, the same way `pnpm` runs the web one. A CI job would be a thin
wrapper, not a new contract:

1. `mise -C apps/mobile-flutter run gate` on a Linux runner with libsodium and
   the Android SDK installed. That is the whole unattended story - it already
   includes the codegen and mirror stale-checks, the em-dash check, the analyzer,
   the tests, the coverage floor, the cross-stack vectors and the debug APK.
2. `mise -C apps/mobile-flutter run integration` and `run e2e` would need an
   emulator **and** a seeded server, so they stay a release ritual either way.

A `pre-push` git hook running the gate would close the "someone forgot" gap
without a provider, at the cost of minutes on every push (the APK step dominates).
Not installed - propose it before adding it.

## Known gaps

- **Release builds are signed with the DEBUG key**
  (`app/android/app/build.gradle.kts`). There is no upload keystore and no Play
  account. A debug-signed `app-release.apk` must never be handed to a tester as
  "the release build": it is not installable over a properly signed build, it
  carries debuggable-adjacent expectations, and its signature proves nothing.
  Anything shared with anyone is a debug build until a real keystore exists.
- Coverage is gated at 60%, not the web side's 98%, and `lib/ui/**` is outside
  the scope entirely (see above).
- CallKit / background call UI / ring push is not wired. The
  `flutter_callkit_incoming` dependency was removed: nothing but dead spike code
  imported it, while it merged `MANAGE_OWN_CALLS`, `USE_FULL_SCREEN_INTENT`,
  `DISABLE_KEYGUARD` and friends into the shipped release manifest for a feature
  that does not exist. Re-add it when the feature is actually built.
- Mobile push (FCM/APNs) needs new server endpoints; the server speaks only
  web-push/VAPID today.
- Passkeys, and everything iOS. See [PARITY.md](PARITY.md) for the full list.
