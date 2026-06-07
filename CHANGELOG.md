# Changelog

All notable changes to Nostragoalus are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions are dated snapshots rather than releases.

## [Unreleased]

## [0.7.1] - 2026-06-08

### Added
- Euro per-match statistics now come from UEFA's official match-centre feed (possession, passes, crosses, distance covered) with event-stream aggregation as fallback.
- Euro knockout bracket, derived from results (feeders ordered under their parents, champion crowned).
- Full player rankings for Euro (paged; previously cut at 200, hiding most of any squad on match pages).
- Finished matches cache their detail and stats for the process lifetime (live ones still refresh every 5 minutes).

### Changed
- Player and coach names render in title case everywhere (FIFA's "Kylian MBAPPÉ" becomes "Kylian Mbappé"; correctly-cased names pass through).

### Fixed
- Coach bookings showed "?" - touchline cards (Nagelsmann, Hjulmand) now carry the coach's name.
- About: theme-aware mise logo, official TanStack icon, project homepages preferred over GitHub links.

## [0.7.0] - 2026-06-07

### Added
- Euro 2024 feature parity with the FIFA competitions: match events (goals with assists, yellow / second-yellow / red cards), per-match stats derived from UEFA's event stream, official squads with positions, season team stats (UEFA-exact), and top scorers / assisters from UEFA's ranking API.
- World Cup 2026 announced squads now show before the tournament (team id resolved from the calendar when no match has been played).
- About page: official logos on every stack card, Bun in the stack.

### Changed
- Competitions ordered newest season first everywhere.
- VueUse adopted where it simplifies: reactive QR rendering for 2FA enrollment, clipboard, tickers (countdowns, next-run labels), system dark-mode detection.

### Fixed
- Team page competition switcher had no defined order.

## [0.6.0] - 2026-06-07

### Added
- UEFA Euro 2024 fixtures and results through UEFA's public match API (groups, knockouts, penalty shootouts).
- Two-factor authentication: TOTP authenticator enrollment with QR + setup key, single-use backup codes (confirmed save step, regenerate on demand), trusted devices with revocation, email codes via SMTP.
- Passkey (WebAuthn) sign-in and management, registration gated behind a fresh password + 2FA confirmation (sudo mode).
- Have-I-Been-Pwned checks rejecting breached passwords at signup and password change.
- Admin: ban/unban users, strip 2FA from an account, per-task last-run/last-failure history in the action tooltips, live next-run countdowns.
- 2FA-gated and last-admin-protected account termination.
- maildev mail catcher in the dev compose overlay; email-OTP end-to-end test (`pnpm e2e:smtp`).
- WTFPL license, coverage badge, this changelog, mise task shortcuts, pinned container images.

### Fixed
- `NUXT_CRON_ENABLED=true` was coerced to a boolean by the runtime config and silently disabled live score polling.

## [0.5.0] - 2026-06-07

### Added
- Per-user preferences (language, theme incl. system) saved to the account and restored at sign-in; browser/system detection for guests.
- Thai and Klingon translations alongside English and French.
- Brand identity: crystal-ball mark, favicon, full-bleed remastered banner with a scroll-driven intro that docks into a slim pinned bar, animated starfield, oracle-eye default avatars.
- Landing page with feature grid, scoring explainer, and competition showcase.

### Fixed
- First-load hydration failure that kept client-only effects (starfield, banner scrub) from running until a client-side navigation.

## [0.4.0] - 2026-06-06

### Added
- Competition in the URL (`/world-cup-2026/matches`, …) with a page-title switcher pill; unknown slugs 404.
- Runtime SSO administration (OIDC, SAML, Google) with envelope-encrypted secrets (KEK -> DEK -> AES-256-GCM).
- Admin user management (create, promote/demote, delete) on the better-auth admin plugin.
- Full team pages: official squads with positions and coach, FIFA-exact tournament stats, competition switcher.
- Match view: football-intelligence stat rows (attempts, passes, distance covered, pressures…), chronological laced timeline with yellow/second-yellow/red cards, editable prediction in place, clickable form/next/head-to-head/standings.
- World map: team in the URL, selection surviving competition switches, click-to-center, clickable group standings.
- Personal stats strip on My Picks; leaderboard movement arrows from rank snapshots; kickoff countdowns.

### Fixed
- FIFA card codes decoded correctly (2 = straight red, 3 = second yellow).
- Penalty-shootout artifacts (0-0 "shootouts") purged at the source and guarded everywhere.

## [0.3.0] - 2026-06-06

### Added
- One ×2 joker per round (movable until kickoff), crowd-rarity bonus, champion pick with country flags.
- Interactive world map (Leaflet + OpenStreetMap) with per-team panels.
- Knockout bracket as a real two-sided tree from FIFA's season bracket.
- Keyless FIFA top scorers, match details (goals, possession, attendance, cards) and live WebSocket score pushes.

## [0.2.0] - 2026-06-05

### Added
- Multi-competition schema: World Cup 2026 (default), World Cup 2022, Euro 2024; per-competition and global leaderboards.
- Scheduled tasks: hourly fixture refresh, 2-minute live polling gated on a live window, 5-minute finalize (lock + score).
- i18n (EN/FR), dark mode, redesigned shell.

## [0.1.0] - 2026-06-05

### Added
- Nuxt 4 + PrimeVue + UnoCSS scaffold, Drizzle + Postgres, better-auth email/password.
- Closeness-tiered scoring engine (exact 3 / goal difference 2 / outcome 1) with idempotent re-scoring.
- Fixtures, predictions with server-side kickoff locks, leaderboard, admin sync; Vitest suite with a 95% (later 98%) coverage gate.
