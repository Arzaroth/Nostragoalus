# Changelog

All notable changes to Nostragoalus are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions are dated snapshots rather than releases.

## [Unreleased]

### Added
- Scoring is now spelled out: predictions show the base points and a separate "+N rarity" chip with an "only X% picked this" tooltip; champion-pick points appear on the leaderboard and player pages; the FAQ carries the full formula in plain notation.

### Changed
- A joker can't be placed on a fixture whose teams aren't decided yet (same rule as predicting it), server-enforced and hidden in the UI.

### Added
- Champion picks visible at a glance: crowned flag beside each name on the ranking and on player pages; player pages gained a competition switcher and a Global scope.
- Landing showcase is a carousel (circular, autoplay) and the map screenshot now actually shows the map.

### Changed
- Single-match rounds have no joker: the final automatically counts double for everyone (badge says so), the third-place play-off scores normally; placing a joker there is rejected server-side.

### Fixed
- Stats skeleton no longer fights the already-loaded possession bar (possession sits above the skeleton, which lost its fake bar).

### Added
- Landing showcase: six real screenshots (fixtures with crowd totals, match depth, ranking, bracket, map, team page) over a seeded league of two dozen demo oracles; mise tasks seed-demo and shots regenerate everything with headless Firefox.

## [0.9.0] - 2026-06-08

### Added
- Crowd totals update live over the WebSocket (anyone saving a prediction refreshes everyone's view, your own saves included) and reserve their line so cards never resize.
- Header crystal ball is bigger, includes the pedestal, and each section glows gold under the cursor (five panels, core, and the orb's outer ring).
- Real 404 page: the shot sails over the bar and becomes a star (clean loop), with a cursor-reactive starfield; the landing starfield got a gravitational lens and the champion pick a holographic hover.
- "Show everyone's totals" preference: under each prediction input, the combined score of all players' predictions (1-1 + 2-1 + 4-0 shows as 7-2) with the prediction count - on fixtures, the match view and My Picks.
- Stats tab shows skeletons while match detail loads.

## [0.8.0] - 2026-06-08

### Added
- All-time head-to-head on the match view, sourced from FIFA's full international calendar (World Cups, qualifiers, continental championships, friendlies - back to 1908 where FIFA has it). Works before kickoff, so it doubles as a prediction tool. Tally + goals line + meeting list, linked to our match pages where we hold the fixture.
- Form shows each team's last five results across ALL international football (friendlies and qualifiers included), with competition and date.
- Next lists the team's competition games after the viewed match - results shown form-style for games played since.
- Live-goal celebration: when a live match's score increases, a pixel-art first-person goal animation takes over for three seconds (contributed artwork; reduced-motion respected).
- Match-page dates include the year (head-to-head reaches back decades).

### Changed
- Head-to-head, Form and the in-house meeting list all cut off at the viewed match's kickoff - the future never dictates the past.
- The head-to-head tab is always visible; pairs with no recorded meeting get a "first meeting" note instead of a silently missing tab.
- All commit history rewritten to the Arzaroth identity.

### Fixed
- Knockout brackets aligned feeder matches under the wrong parents (FIFA lists knockout matches arbitrarily; Morocco and Brazil sat on the wrong sides). A shared ordering pass now walks down from the final for every provider.
- Bracket cards showed (0) penalty scores on matches decided in regulation; pens render as superscripts only for real shootouts.
- The final is pinned to the semis' midline; connector lines merge mid-gap and lead straight into the next fixture; dates centered on every card.
- Euro bracket cards showed "Invalid Date" (UEFA bracket matches lacked kickoff times).
- Match players tab lists contributors only instead of full 26-man rosters of zeros.
- About: Motion's own mark replaces the Framer design-tool logo; official favicons for Nuxt I18n, node-postgres, Nodemailer, maildev.

## [0.7.1] - 2026-06-08

### Added
- Euro per-match statistics now come from UEFA's official match-centre feed (possession, passes, crosses, distance covered) with event-stream aggregation as fallback.
- Euro knockout bracket, derived from results (feeders ordered under their parents, champion crowned).
- Full player rankings for Euro (paged; previously cut at 200, hiding most of any squad on match pages).
- Finished matches cache their detail and stats for the process lifetime (live ones still refresh every 5 minutes).

### Changed
- Player and coach names render in title case everywhere (FIFA's "Kylian MBAPPÉ" becomes "Kylian Mbappé"; correctly-cased names pass through).

### Fixed
- Coach bookings showed "?" - touchline cards (Nagelsmann, Hjulmand) now carry the coach's name and a clipboard marker, on both providers.
- Second yellows on Euro matches were dropped (UEFA encodes them as explicit YELLOW_CARD_SECOND / RED_YELLOW_CARD events).
- Euro matches synced before the stats feed landed had no possession - backfilled.

### Added (UX)
- Match view remembers its open tab in the URL (survives refresh, shareable); stats is the default tab when available.
- Substitutions on the match timeline (on/off players, both providers) with persisted toggles to hide subs or bookings.
- Auto-generated API documentation at /docs/api: every route annotated (summaries, descriptions, request bodies, response codes), framework internals filtered out, admin endpoints labeled internal, httpie as the default snippet client; GET responses carry real schemas and examples sampled from the live API.
- Head-to-head tally bar on the match view (wins / draws / wins, shootouts counted as wins).
- Public info pages (About, License) share one shell (starfield + footer); footer and About link the now-public source repository.
- /license page rendering the WTFPL, linked from the footer; the footer (with its own-line "Made with ♥️ from 🇫🇷") is shared with the About page.
- About: VueUse, Nuxt I18n and node-postgres added to the stack.
- Fixture search is accent-insensitive and matches country codes ("Tur" finds Türkiye, "FRA" finds France).
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
