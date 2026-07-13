# Nostragoalus mobile (Flutter)

Native client. See `../ROADMAP.md` for the phased build plan. This dir is the
Flutter app; `../parity` is the cross-stack parity runner (Dart ports checked
against `shared/parity-json`).

> Authored without a Flutter SDK in the build env - first `flutter run` / `flutter
> test` is the real validation.

## Toolchain (not React Native - no metro)

| Task | Command | Where it runs |
|---|---|---|
| Dev + hot reload | `flutter run --dart-define=API_BASE=<url>` | emulator or device |
| Unit / widget tests | `flutter test` | headless (CI) |
| Parity tests | `dart test` (in `../parity`) | headless (needs native libsodium for e2ee) |
| E2E (Playwright-equivalent) | `flutter test integration_test/` | emulator or device |
| Android build | `flutter build appbundle` -> Play internal | - |
| iOS build | `flutter build ipa` -> TestFlight | needs macOS + Xcode + Apple dev acct |

`adb` is Android device/emulator plumbing (install, `adb logcat`); Flutter shells
out to it. Android emulator reaches your host at **`10.0.2.2`**, not `localhost`.

## First-time setup

```sh
cd apps/mobile-flutter/app
flutter create .            # generates the ios/ android/ platform scaffolding
flutter pub get
```

## Phase 0 - running the spikes

**#1 Auth** (emulator is fine):
```sh
# Requires the bearer() plugin enabled + deployed server-side (apps/web-nuxt/lib/auth.ts).
flutter run --dart-define=API_BASE=https://goal.arzaroth.com
# enter creds, tap "Run auth probe" -> expect "PASS - bearer auth works end to end"
```

**#3 E2EE** (headless):
```sh
cd ../parity && dart pub get && dart test   # replays shared/parity-json incl. the e2ee KATs
```

**#2 Voice** (`[!]` needs 2 real devices + the coturn relay - CallKit doesn't run
on the iOS simulator): build out `lib/spike/voice_probe.dart` on-device, mirroring
the web voice client (`apps/web-nuxt/server/utils/live/voice.ts`, message types
`voice:roster/signal/peer-reset`) and `GET /api/voice/ice-servers`.

## Layout
```
lib/
  config.dart            API base + WS url (--dart-define overrides)
  main.dart              throwaway spike launcher (auth)
  spike/auth_probe.dart  bearer login + authed call
  spike/voice_probe.dart WebRTC + CallKit + WS signaling skeleton
```
