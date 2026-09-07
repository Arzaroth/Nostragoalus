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
| `api/` | `dio` client (`api_client.dart`) + `models.gen.dart`, generated from `shared/contracts-openapi/` by `tool/gen_models.dart` and never hand-edited. The endpoints are one `extension` on `ApiClient` per feature (`leagues_api.dart`, `chat_api.dart`, `dm_api.dart`, ...), re-exported by the `api.dart` barrel. |
| `state/` | Riverpod providers, the app's answer to the web's vue-query composables. |
| `ui/` | Every screen and widget. |
| `leagues/` | League-shaped pure logic: role permissions, and `league_selection.dart`, the per-competition league lens (the Dart side of the web's `ng-league` cookie). |
| `chat/`, `e2ee/`, `kt/` | E2EE chat + DMs: group keys, sealed boxes, key transparency. Dart ports of `apps/web-nuxt/app/utils/e2ee.ts` and the KT chain. |
| `voice/` | WebRTC mesh over the same signaling the web app uses ([../architecture/webrtc.md](../architecture/webrtc.md)). |
| `live/` | The WS hub client ([../architecture/realtime.md](../architecture/realtime.md)). |
| `i18n/` | Reads `assets/i18n/*.json`, mirrored from `shared/i18n-json/`. Same five locales, same keys, RTL included. |
| `deeplink/` | Inbound `goal.arzaroth.com/...` App Links. |
| `auth/` | Identifier-first SSO: the browser round trip and the code exchange ([../architecture/auth.md](../architecture/auth.md)). |

## Versions, and the floor under them

There is ONE version line. `apps/web-nuxt/package.json` is it: the release task
bumps it, `apk-publish` reads it for the APK's `versionName`, derives
`versionCode` as `major*10000 + minor*100 + patch`, and stamps it into the build
as `--dart-define=APP_VERSION`. `pubspec.yaml`'s own `version:` is vestigial and
ignored. So the app on the site and the site serving it carry the same number by
construction.

A sideloaded APK never auto-updates, which is the whole problem: an install from
any past release can still be talking to today's server. Two things address that,
and neither is a compatibility matrix - there is one server, and the APK is
downloaded from it, so a matrix would have one meaningful row and would rot.

**The app says which build it is.** `AppConfig.clientId` is `android/<version>`,
set once on the shared dio's default headers in `api/api_client.dart` and sent
as `x-ng-client` on every request. A build made outside `apk-publish` carries
`dev`, which the server's version pattern rejects - so a dev build is
unidentified, never refused. `test/tool/apk_publish_test.dart` guards the define
itself: drop it and every published APK would silently report `dev`, leaving the
floor inert forever.

**The server can refuse a build it has outgrown.**
`server/utils/clients/service.ts` holds `MIN_ANDROID_CLIENT` and the decision
(`clientRefusal`, so the composition is testable and not just its three parts);
`server/middleware/client-version.ts` is the shell that answers **426 Upgrade
Required** with `{error, minimum, current, downloadUrl}`. It reads the path
through `routedPath`, not `event.path`, for the reason `utils/auth/routed-path.ts`
exists, and sets `Vary: x-ng-client` on the gated paths so a future `swr`/`cache`
route rule cannot serve one client class's answer to another.

Raising the floor locks out installs that cannot update themselves, so it is a
deliberate act, never release bookkeeping - and setting it TO the version being
released is a force-upgrade, not a floor, since it refuses everything except the
build cut from that release. `NUXT_MIN_ANDROID_CLIENT` overrides the constant at
runtime, so a floor set too high is undone by restarting the container rather
than by editing code, rebuilding the image and redeploying while every mobile
user is locked out; a value that is not a plain dotted version is ignored rather
than obeyed.

Two exemptions, both so a refused user has a way forward: page documents are
never gated (the website is how you get a newer app), and neither is
`/api/app/android` (it is the route that says which build to install, so gating
it behind the check that rejected you would leave the app unable to say what to
do). `isVersionGatedPath` holds that decision.

The floor only sees clients that identify themselves. Older APKs send no header
and are indistinguishable from a browser, so there is no way to catch them
retroactively - which is the reason to start now rather than later. It ships set
to the release BEFORE the header existed, so it is inert on day one: the
mechanism is proven by tests, not by turning anyone away. And it must never be
ahead of the version being released, since `apk-publish` stamps an APK from the
same package.json and a floor above it would refuse the build cut from that very
release; `clients/floor.test.ts` fails the gate if it ever is.

On the app side a 426 carrying the server's own `client_too_old` body - not any
426, since a captive portal or CDN edge can answer one too - parses into
`clientRefusalProvider`, and `_VersionGate` in `app.dart` replaces the tree with
`ui/update_required_screen.dart`. The screen names the version the server asked
for and follows the `downloadUrl` it sent, so moving that route does not strand
installed apps.

Two things about where the gate sits. It wraps the **Navigator**, inside
`MaterialApp.builder`, rather than living at `home:` - as a route it would render
under whatever the user had pushed, and they would go on tapping through screens
whose every request 426s. And it is above the auth gate, because a build the
server refuses cannot sign in either. That placement is why it has to call
`dropSplash()` itself: `main()` holds the native splash until a real screen is on
the glass, the auth gate normally drops it, and a branch that renders without
dropping it leaves the app frozen on the splash - which is how this shipped in
review, and what `test/update/version_gate_test.dart` now mounts.

The flag is one-way: the build is too old regardless of who is holding the
phone.

Separately, preferences carries `ui/widgets/update_check_card.dart` - "This
build", and a button that asks `/api/app/android` whether a newer one is
published. Nothing checks on launch, on a timer, or in the background: the app
cannot install its own update, so an unrequested check could only be a nag. The
comparison is `isNewerVersion` in `update/app_update.dart`, numeric per segment
because a string compare puts "4.10.0" before "4.9.0" and tells everyone on the
newest build they are up to date - the server side needs the same ordering, and
`shared/version.ts` is the one implementation both the changelog badge and the
floor use. An unstamped build is not compared at all: `dev` parses as 0, so
comparing it would announce an update to every developer build, which is usually
AHEAD of the published one. Sizes are formatted in the same mebibytes to one
decimal the website's download card uses, because the card tells the user to go
there and verify the digest.

## Getting around

`ui/home_shell.dart` is the signed-in shell: an `IndexedStack` over six tabs -
matches, standings, leaderboard, leagues, chat, account - so each keeps its
scroll and query state when you switch. The selected tab lives in
`homeTabProvider` (a `HomeTab` enum, whose `.index` orders the screen list) rather
than in the shell's own state, so a screen can send the user to a sibling tab -
the chat tab's no-leagues state points at the leagues tab instead of pushing a
second copy of it. Because it now outlives the shell widget, it is reset with the
account caches; otherwise the next account would land on the tab the last one
left open.

Six equal-width tabs leave about 60dp each, which the web header's wording does
not survive: in French `nav.standings` ("Classement") and `nav.leaderboard`
("Classement joueurs") would sit side by side and ellipsize to the same
"Classem...". The bar reads `nav.tab.*` instead, a short label per destination.

Both app-bar pickers are one widget, `ui/widgets/app_bar_picker.dart` - they sit
in the same app bar, and writing the second by copying the first is how their
tooltips drifted apart the first time.

Chat is a tab because mobile has no dock. The web keeps `ChatDock.vue` on every
page; here `ui/chat_rooms_screen.dart` is the way in - direct messages, badged
with the unread total across threads, then one row per league in the selected
competition **that has chat on**, each opening `LeagueChatScreen`. A chat-less
league is not a room (it would open a disabled panel), which is how the web dock
filters too. The badge stays live off the notifications frame, since a DM raises
a `DM_MESSAGE` notification and nothing else announces one. The rooms are
competition-scoped, so this tab carries the competition switcher; the old routes
into chat (a league's own screen, its board) still work.

Two app-bar switchers scope what a screen reads:

- `ui/competition_switcher.dart` sets `selectedCompetitionProvider`, the slug
  every scoped read filters by.
- `ui/league_switcher.dart` sets the **league lens**: Everyone, or one of the
  user's leagues. It is the mobile `LeaguePill.vue`, and it narrows the
  leaderboard and the crowd consensus to that league's members. It rides in the
  matches and leaderboard app bars and hides itself when the user is in no
  league here.

The lens is per competition and persisted, the same map shape as the web's
`ng-league` cookie: `leagues/league_selection.dart` holds the pure helpers,
`leagueSelectionsProvider` the persisted map (in the keystore via `AppPrefs`,
alongside the locale and competition), `selectedLeagueIdProvider` the value for
the competition on screen. `selectLeague` files a pick under the LEAGUE's own
competition and moves the app there, rather than under whatever slug is selected
at the instant of the tap: before the user has ever opened the competition
switcher there is no slug and `/api/leagues` answers across every competition,
and during a switch the menu still lists the previous competition's leagues.
Sign-out clears the lens outright - it names a league membership, so the next
account on the device must not inherit it, the same reason `AuthRepository`
clears the chat private key there.

`leagueLensGuardProvider`, read once by the signed-in shell (not by the root
widget - every read it listens to needs a session), keeps the lens pointing
somewhere real. It prunes a lens the leagues list no longer contains, but only
once that list has *settled*: not while loading, because a just-joined league is
written to the lens while the list is still serving the previous one, and not on
an error either, because riverpod keeps the previous value alongside one and a
failed refetch after a competition switch would otherwise prune the new
competition's lens against the old competition's list. It also clears a lens that
any lensed read answers 404 to - both reads, not just the leaderboard, or a user
sitting on a match detail would keep a dead lens until they opened the board.

Server-side the lens is `?league=` on `/api/leaderboard` and
`/api/predictions/crowd`. A league fixes its own competition, and sending a slug
alongside it 400s when the two disagree, so `leagueScopedQuery` in
`api_client.dart` sends the league *instead of* the slug, never both. The
leaderboard under the lens also returns `hiddenCount`: members an admin has
hidden from the board, whose picks still count - not private profiles, which
only enter the outsider view the lens never uses.

The crowd card (`ui/match/crowd_consensus.dart`) shows the league's members
under the lens with the everyone line beneath it, and says why: the scoring
crowd bonus is always computed from everyone, never from one league. A league
too small to clear the server's anonymity floor falls back to the everyone card
rather than rendering nothing.

## Look and feel

The app has its own design system, "Floodlit": a night match. The ground is a
dark blue-black lit by two soft glows (primary from the top corner, emerald from
the far side, painted by a `CustomPainter` in `app.dart`); chalk hairlines are
the structure; the scoreboard numerals are the one loud element. The web brand
survives as roles, not decoration: indigo is the interactive colour, emerald is
the pitch (exact / correct / online), amber the floodlight (star / joker /
champion), red is live. Light mode (paper ground, white panels, ink text) is an
opt-in the theme keeps coherent; dark is the default (a null or unknown user
preference lands on dark; only an explicit `light`, or `system`, opts out).

`theme/app_theme.dart` holds the whole system: the two `ColorScheme`s, an
`AppTokens` `ThemeExtension` (`context.tokens`: `rule` / `ruleStrong` hairlines,
`board` / `raised` / `ground` surfaces, `muted` / `faint` text, the semantic
accents, the gold / silver / bronze podium metals, and `score(size)`, the
condensed tabular numeral style), the text theme and every component theme
(inputs, chips, tabs, dialogs, sheets, menus, snackbars). `context.tokens` falls
back to the brightness defaults when a tree was themed without the extension, so
widget tests on a bare `MaterialApp` still render. Type is vendored under
`app/assets/fonts/` (OFL): Barlow for everything read, Barlow Condensed for what
is glanced at - scores, points, ranks, stats and screen titles. Arabic falls back
to the platform face per glyph run.

The primitives live in `ui/widgets/`: `panel.dart` (`Panel`, one rounded surface
holding rows split by `Hairline`s; `PanelRow`; `PanelHeading`, the condensed
heading above a panel; `Tag`, a quiet status word; `LiveDot`, the one
non-user-triggered motion, which respects reduced motion), `stat_tile.dart`
(`StatTile` + `StatBand`, the hairline-split scoreboard strip), `section_card.dart`
(heading + panel), `empty_state.dart` (message + optional action),
`app_nav_bar.dart` (the bottom bar: chalk top rule, active tab marked by a short
goal-line, no pill). Lists are panels, never stacks of cards; a card is reserved
for a singular object. Numbers that are glanced at use the score face; nothing is
set in all caps or tracked out.

Matches are flag-forward. `ui/widgets/team_flag.dart` renders a national flag by
FIFA tricode from `app/assets/flags/<CODE>.png` - the same square FIFA images the
web's `flagUrl` serves ([../architecture/cross-stack-contract.md](../architecture/cross-stack-contract.md)),
vendored (not a package, not a CDN) so they work offline, with a tinted code-chip
fallback for a missing flag. `ui/widgets/match_card.dart` is a panel row: flag +
name on each side of `score_pill.dart` (the score in condensed numerals, the
kickoff time for a scheduled match, the breathing dot for a live one), a live
match carrying a red start rail. `ui/widgets/leaderboard_row_card.dart` mirrors
the web `LeaderboardRowCard`: podium-coloured rank numeral + movement, avatar,
champion/best-scorer flag badges, exact/correct line, points in the score face,
with the signed-in player's row tinted. The fixtures screen
(`ui/matches_screen.dart`) leads with a Points/Rank/Exact `StatBand`, the
champion + best-scorer pick rows, and Full-time/Live/Upcoming filter chips, then
one panel per round (played rounds fold). The match header, prediction editor
(big condensed steppers), standings (emerald qualification rail), leagues, chat
(bubbles: own on `primaryContainer`, others on `raised`), account and the
settings-style screens all sit on the same panels.

The flag set under `app/assets/flags/` is vendored image assets, not a synced
mirror of a `shared/` source, so it is not part of the stale-check below; a new
tricode is added by dropping its PNG in.

## Three committed mirrors, all stale-checked

Nothing in the app is the source of truth for shared data. Three artifacts are
generated, committed, and re-checked by the gate:

- `app/lib/api/models.gen.dart` from `shared/contracts-openapi/`, via
  `tool/gen_models.sh`. A contract field with a closed set of 2+ string values
  becomes a real Dart `enum` (`StatusValue`, `ModeValue`, ...) carrying its wire
  string on `.wire`, plus an `unknown` member: a value this build never heard of
  degrades to `unknown` instead of throwing, so a newer server cannot brick an
  installed app. One enum is shared by every field with the same value set;
  a single-value literal stays a plain scalar with a `<field>Values` constant.
  `state/providers.dart` re-exports `api/api.dart` so the per-feature extension
  methods resolve at every screen that reads `apiProvider` (a Dart extension is
  only callable where its library is in scope).
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

`app/tool/coverage_check.sh` sums `LF`/`LH` from the lcov and fails under **98%**
line coverage over `lib/` minus `lib/api/models.gen.dart` (generated),
`lib/ui/**` (screens/widgets, the analogue of `app/pages`, which the web gate
also leaves out) and `lib/main.dart`. The floor launched at 60, what the suite
honestly measured then, and was ratcheted to the web's 98 as the suite grew;
ratchet it up, never down.

It is still **weaker than the web gate** and should not be described as matching
it:

- the same 98% bar, but over a smaller scope: `lib/ui/**` is outside it, and the
  web gate's SSR build has no analogue beyond the debug APK
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
  `NG_ANDROID_{STORE_PASSWORD,KEY_ALIAS,KEY_PASSWORD}`. An unconfigured checkout
  falls back to the debug key purely so `flutter run --release` works. That
  fallback must never be the identity published in `assetlinks.json`: the debug
  keystore ships with every Android SDK, so anyone could then claim
  `goal.arzaroth.com`'s links. The release keystore lives OUTSIDE the repo
  (`~/.keys/nostragoalus/`) so no worktree removal or clean can destroy it -
  losing it means never being able to update an installed app. `key.properties`
  is the gitignored in-repo pointer at it, and deliberately NOT copied into
  worktrees: signing credentials should not fan out across directories, and
  publishing happens from the main checkout. A worktree that tries fails loudly
  on the keystore guard rather than quietly shipping a debug-signed APK. There is
  still no Play account.
- **The published APK is built against the public origin**, and the publish task
  enforces it. `AppConfig.apiBase` is a compile-time `String.fromEnvironment`
  defaulting to the emulator's host alias, so `mise -C apps/mobile-flutter run
  apk-publish` passes `--dart-define=API_BASE` and `WEB_BASE` (overridable with
  `NG_APP_API_BASE` / `NG_APP_WEB_BASE`) and refuses to publish unless BOTH are
  https on a routable host, a release keystore is configured, and the version
  parses as x.y.z. v4.7.0 shipped without the define:
  every install could reach nothing, and the sign-in screen reported that as a
  wrong password. `versionName`/`versionCode` come from the release version too,
  so the APK's own metadata matches what `/api/app/android` advertises.
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
