# Changelog

All notable changes to Nostragoalus are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions are dated snapshots rather than releases.

## [Unreleased]

## [1.16.0] - 2026-06-15

### Added
- **Notification center**: a bell in the header collects what matters to you - a reminder for a match locking soon you haven't predicted, the result of each match you did predict (the scoreline and the points it earned), league activity (joins, role changes, being added or removed), and how your champion and Golden Boot picks finished - with an unread count and live updates as things happen. Reminders only go to players already in the competition, clear themselves once you make the pick or the match kicks off, and like the rest can be marked read or tapped to jump straight to the match, league or competition.
- The admin Users list has a debounced search (display name fuzzy, or email exact) and now shows each account's join date.

### Changed
- On the fixtures page, the search now lives in the status-filter row (right-aligned, opened by its icon or Ctrl/Cmd+F) and is a country multiselect: pick one or more teams (fuzzy, accent-insensitive typeahead) to filter the fixtures to those, instead of a free-text box.

### Fixed
- The match Stats tab now shows a "No stats yet" message when a match has started but no stats have come in, instead of a near-empty panel.

## [1.15.0] - 2026-06-15

### Added
- The landing banner now settles into its slim header bar reliably on every screen size and stays compact while you read, instead of re-expanding as you scroll back toward the top. A scroll cue beneath it glides the banner up and jumps straight to the matches and your picks; it steps aside while the next-match prompt is showing and respects reduced-motion.
- A teaser on the signed-out landing page: the next fixture with a countdown, plus how many players have joined and predictions made so far. No names, and each part stays hidden until there's something worth showing.

### Fixed
- The scoring FAQ now documents the result-rarity bonus (the small extra for calling a rare but correct result) that shipped with the tunable scoring update - it previously listed only the exact-score rarity tiers.

## [1.14.0] - 2026-06-15

### Added
- The minute-by-minute play-by-play timeline now covers UEFA competition matches (the Euro), not only the World Cup - goals, cards, substitutions, shots, fouls, period markers and VAR decisions, in their own tab on the match page. Each line reads in your own language like the rest of the timeline; VAR decision text is shown in English where the feed provides it.

## [1.13.1] - 2026-06-15

### Fixed
- The admin Scoring rules page no longer renders cramped: the tier-row and joker inputs overflowed their set width and overlapped the labels and the joker toggle.

## [1.13.0] - 2026-06-15

### Added
- **Scoring rules admin page** (`/admin/scoring`): edit the points, bonuses and rarity tiers from the app instead of the database. There is one default ruleset that applies everywhere, plus optional per-competition overrides - tune one tournament without touching the others. Saving recomputes every affected leaderboard right away, and a competition's override can be removed to fall back to the default.
- **Result-rarity bonus**: on top of the existing exact-score rarity, a small bonus now rewards calling a rare but correct result (e.g. backing the underdog when most of the field picked the favourite). It is a tunable extra layer on the crowd bonus, on by default for new installs and configurable per competition.

### Fixed
- In a league, hovering the crowd score under a match no longer stacks two overlapping tooltips: the league and everyone totals now show their labels below the line.

## [1.12.1] - 2026-06-14

### Added
- Admins can re-run the champion FIFA-rank backfill from the Background tasks page. It repairs champion picks that saved without a FIFA rank (and so paid the flat bonus instead of the rank tier) when the ranking feed was unreachable during the pick window, restoring the rank and the correct potential points.

## [1.12.0] - 2026-06-14

### Added
- **League tab on the match page**: when you have a league picked, a match that has kicked off shows a "League" tab ranking your fellow members by the points their pick earns on that match. While the match is live the points update with the score (provisional, same scoring as full-time); once it finishes they settle to the final tally. Picks stay hidden until kickoff, and members who did not predict are summarised at the bottom.

## [1.11.1] - 2026-06-14

### Fixed
- During the second-chance window, the Champion and Best scorer cards now show the halved worth for a previewed pick, including a late first pick (it previously showed the full worth even though such a pick scores half).

## [1.11.0] - 2026-06-14

### Added
- **Second chance for champion & Golden Boot picks**: once the group stage is nearly over (from the last group round until the knockouts begin), you get one last chance to switch your tournament-winner and top-scorer picks - for half the points. The switch is permanent (reverting doesn't restore the full value), a confirmation spells that out, and your original pick stays on show beside the new one. A player who never picked can also make a late first pick during the window, for half.

### Fixed
- The Best scorer showcase now shows a player's official headshot when one exists only on the squad feed (some players, e.g. Edin Dzeko, had no image at the id-derived path we used and fell back to the team flag).
- On mobile, the fixtures list now waits for the Champion and Best scorer cards above it to finish loading before it appears, so the on-load jump to the next match lands on the right row instead of stopping short once those cards grow.

## [1.10.0] - 2026-06-14

### Changed
- The admin panel is now organised around a left-hand menu instead of one long scroll: sign-ups, SSO, users, leagues, roadmap and scheduled tasks each get their own full-width page. The scheduled-tasks view folds in alongside the rest (the old `/admin/cron` link still works), and the page uses the full width of wider screens.

## [1.9.0] - 2026-06-14

### Changed
- On the fixtures page, clicking anywhere on a match card opens the match, not just its title (the score inputs, joker button and team links still work as before).
- The match play-by-play is now written in your own language (it previously echoed the data feed's English commentary), and each line drops the redundant country name since the team flag already shows the side.
- Fouls in the play-by-play now show a referee whistle icon instead of a warning sign.

### Fixed
- Joker buttons are now disabled for the rest of a round once that round's joker is locked on a started match (it can't be moved), with a tooltip explaining why - instead of letting the click fail. Any remaining error shows as a toast rather than an inline banner that pushed the page down and broke the match list's scroll area.
- Dates now follow the selected language everywhere (fixtures, match view, bracket, map, team and profile pages) instead of the browser's locale.
- The match status tags (Scheduled, Live, Full-time, ...), prediction result tiers (Exact score, Goal difference, Right result, Missed), the group labels and the bracket round names (incl. Champion / 3rd place) are now translated in every language.
- The match play-by-play no longer stretches the whole page when it has a lot of events: on wider screens the timeline scrolls within a bounded area (the page keeps scrolling normally on mobile).
- The match play-by-play no longer renders its first rows with the wrong (loading) layout or an uncapped height after a page refresh.
- Switching tabs on the match view no longer jumps the page back to the top.

## [1.8.1] - 2026-06-14

### Changed
- The **Champion** and **Best scorer** picks now sit side by side in a tighter, more compact layout, with loading skeletons so they appear together instead of popping in one after the other.
- On wider screens the matches list scrolls in its own region so the header, your stats, the picks and the filters stay put (it falls back to normal page scrolling on smaller ones). On load it jumps to the first live match, or the next upcoming one, and each round (Matchday 1, Round of 16, ...) can be collapsed.

## [1.8.0] - 2026-06-14

### Added
- **Email verification for sign-ups** (admin-toggleable): admins can require new accounts to confirm their email before signing in, from a new Sign-ups section on the admin page. The toggle needs SMTP configured; turning it on marks all existing accounts as verified, so only new sign-ups are affected. Admins can also force-verify any account ("mail never arrived"), and never-confirmed accounts older than 7 days are cleaned up daily. SSO sign-ins are unaffected. After signing up, users see an on-screen confirmation to check their inbox; a blocked sign-in shows a clear notice with a one-click resend, and the link is no longer auto-resent on every attempt. Clicking the verification link signs you straight in and lands on a dedicated confirmation page (instead of flashing a logged-out page on the way to sign-in).
- **Branded HTML emails**: verification, password-reset, account-deletion and sign-in-code mails now have a styled HTML version with a clickable button (and the raw link as a fallback), alongside the existing plaintext.

### Changed
- Sign-in, sign-up and password pages now use a focused layout without the main competition navigation.

## [1.7.0] - 2026-06-14

### Added
- **Background tasks** admin page: every scheduled and on-demand job (live score polling, fixture and bracket refresh, lock-and-score, odds snapshots/backfill, fixture import) with its schedule, next and last run, run count and result. Run any on the spot, and tap a result to see its last output or error.

### Changed
- Fixture import moved onto the Background tasks page (it was a standalone admin button), so all the manual data jobs live in one place.

## [1.6.0] - 2026-06-13

### Added
- **League invite links**: owners and moderators can mint shareable join links from the league card, with an optional expiry (24 hours to 30 days) and a cap on the number of uses. Opening a link shows the league and joins with one click; signed-out visitors are sent through login and land back on the league automatically.

## [1.5.2] - 2026-06-13

### Added
- The match play-by-play now also shows fouls, and tags each event line with the relevant team's flag.

### Changed
- When the home-page next-match/live prompt is too narrow to fit on one line, the two teams now stack vertically (home, separator, away) instead of wrapping awkwardly, and long team names wrap cleanly within the card.
- The next-match countdown now sits next to the "Next match" label instead of off to the side, so the card stays centered.

### Fixed
- The fixtures page now keeps up as a match goes live then finishes without a reload: your pick locks at kickoff and the points appear after full-time (the score and status already updated live).
- Penalty awards now appear in the play-by-play (they were dropped when the feed gave them no commentary text).
- A few tooltips (second yellow card, captain, joker) were English-only; they are now translated in every language.

## [1.5.1] - 2026-06-13

### Fixed
- The home-page next-match and live-match prompts no longer overflow the screen on narrow viewports: they wrap and stay within the window instead of clipping off the edges.

## [1.5.0] - 2026-06-13

### Added
- Nostragoalus is now an installable PWA (app icons + web manifest), so you can add it to your home screen and launch it like an app.
- A "new version available" banner appears after a deploy and reloads to the fresh build on your tap, instead of leaving you on a stale bundle. It never reloads mid-prediction, and a later deploy re-surfaces it even if you dismissed an earlier one.

## [1.4.0] - 2026-06-13

### Added
- A "next match" prompt on the landing page: when you're signed in, it surfaces your next fixture with a countdown and a one-tap jump to its pick, plus a live-now pill (a count when several matches are in play) that deep-links straight into the action. Scroll past or follow it to dismiss.
- Status filter chips on the fixtures page (full-time / live / upcoming) with a clear "Full-time" label; the landing live pill deep-links here pre-filtered to live and scrolled to the match.

### Changed
- The Golden Boot (best-scorer) award now shows a real gold boot icon instead of the plain 👟, so it no longer looks identical to the assist symbol used elsewhere.

## [1.3.1] - 2026-06-12

### Fixed
- Play-by-play: own goals now show on the side that benefits from them (the team whose score went up), matching the timeline under the score.

## [1.3.0] - 2026-06-12

### Added
- **Play-by-play**: a new tab on the match view with the full minute-by-minute timeline (goals, cards, substitutions, shots, penalties, VAR), newest first. It opens by default on live matches; the quick-glance events under the score stay as they were.

### Changed
- Leaderboard ties: players level on points (then exact scores, correct results, goal difference) now share the same rank, and the next place is skipped. Join date is no longer a tie-breaker. A tooltip on the leaderboard explains the order.

### Fixed
- Leaderboard live ranking: points from in-progress matches now move you up the board, while the displayed total stays your confirmed score with the live points shown as a separate "+N" delta.
- The live clock now shows "HT" at half-time (FIFA keeps a match marked live through the break, so it previously showed a bare "LIVE").
- Live substitutions no longer flash "?" for the players involved in the seconds right after a change.
- A live match view now updates on its own when the match kicks off or finishes, even if its tab was in the background, instead of staying on a stale "Live" until you reload.

## [1.2.0] - 2026-06-12

### Added
- Every page now sets a proper browser-tab title (e.g. "Matches · Nostragoalus", or "Korea Republic – Czechia" on a match), instead of every tab reading "Nostragoalus".
- The live match view shows the running clock under the score ("61'", or "HT" at the break) next to the live indicator.

### Fixed
- During a live match the goal timeline, stats and possession now update from live data - they previously only filled in once the match finished.
- The possession bar accounts for contested possession (an "in contest" segment), so the two sides add up to 100%.

## [1.1.2] - 2026-06-12

### Changed
- The About page lists each dependency separately, each with its own one-line description.

### Fixed
- The `create-admin`, `roadmap-seed` and `roadmap-add` CLI tasks work on a production host now - they connect to the dockerized database directly instead of needing a local install.

## [1.1.1] - 2026-06-12

### Added
- `mise run roadmap-seed`: bootstrap the public roadmap with a curated starter set (idempotent - skips a roadmap that already has items).

### Fixed
- Opening a modal no longer nudges the page sideways (the scrollbar gutter is reserved, so the layout doesn't reflow).
- The changelog on the About page now renders its markdown (bold, `code`, links) instead of showing the raw symbols.
- Crowd-score tooltips are stylized consistently, whether or not a league is selected.
- The About page and the FAQ now credit Sofascore (the odds source) alongside FIFA, UEFA and OpenStreetMap.

## [1.1.0] - 2026-06-12

### Added
- **Roadmap**: a public `/roadmap` page (linked in the footer) showing what's **in progress**, **planned**, and **shipped**. Admins curate it from the admin panel - add, edit, delete items, move them between columns and reorder within a column - and there's a `mise run roadmap-add` CLI for quick entries.

## [1.0.2] - 2026-06-12

### Changed
- Nostragoalus is now dual-licensed under **MIT OR WTFPL** - use whichever you prefer (footer link and the in-app license page show both).
- Landing showcase screenshots refreshed to the current UI and captured in **both light and dark**, served to match your theme; uniform card sizes (no gap before the caption), a leagues view added, and the admin nav / dev tooling hidden in them.
- The FAQ "how points are calculated" formula is now translated into all four languages (was English-only).
- The bot's consensus list marks not-yet-kicked-off (admin-only) matches with the same divider the player-picks view uses, instead of a banner.
- `mise run db-backup` can prune old dumps: `--keep N` / `BACKUP_KEEP` (newest N) and `--max-age-days D` / `BACKUP_MAX_AGE_DAYS` (by age). Both default to unlimited, so nothing is pruned unless you opt in.

### Fixed
- The best-scorer card shows the points a winning pick is worth even once it's locked, not only while picking.
- The login form submits on Enter from any field (it's a real `<form>` now).

## [1.0.1] - 2026-06-11

### Changed
- Landing showcase screenshots refreshed to the current UI, and a consensus-bot screenshot added to the carousel.

## [1.0.0] - 2026-06-11

### Changed
- Landing page refreshed for the 1.0 launch: the feature grid now covers private leagues, the Golden Boot pick and the consensus bot; the scoring section and the "how points are calculated" formula match the current rules (correct-result rarity tiers, FIFA-rank champion bonus, Golden Boot bonus); new FAQ entries for the Golden Boot, leagues and live standings.

## [0.22.0] - 2026-06-11

### Added
- Live provisional standings: while matches are in progress the leaderboard folds in what each player *would* score at the current scoreline (full scoring, bonuses included), ranks provisionally, shows a "+N live" delta per row and a pulsing LIVE badge. It updates over the WebSocket as scores change - no polling.
- The group standings table on a match view now tracks the live match: the in-progress scoreline counts provisionally and updates in place.
- Your best-scorer pick now shows on your profile (team flag + 👟) beside your champion, and the best-scorer card shows the points a winning pick is worth.
- The fixtures list updates live - match status and scores refresh in place as games play, over the WebSocket.
- While a match is live, its stats and event timeline now stay up to date.
- Admin viewing a player's picks sees their not-yet-kicked-off picks too, behind a divider that marks them admin-only.

### Changed
- Crowd rarity bonus reworked (MPP-style): a pick's exact-score rarity is now measured among the players who got the correct *result*, not the whole field, and the tiers are tighter - only a clear minority of that right-result crowd earns a bonus, with a steeper climb for genuinely rare calls. Already-scored games are re-scored under the new rules.

### Fixed
- A match marked full-time on FIFA could stay "live" in the app for up to an hour (FIFA drops finished games from its live feed); the final whistle now lands on the next 2-minute poll.
- You're always shown on a leaderboard you belong to, even if your account is hidden from public boards - a hidden account no longer saw an empty board in its own league.
- Live stat/event updates patch in place instead of flashing the loading spinner and redrawing the timeline.
- The crowd-bot league name no longer overflows the page header on mobile.
- The banner logo and title now settle together when the bar docks (the title no longer shrank well before the planet).

## [0.21.0] - 2026-06-11

### Added
- Champion pick difficulty: the points a champion pick is worth now depend on the team's FIFA world ranking at pick time - favorites pay the flat bonus, long shots up to 4x. The worth (and the team's FIFA rank) is shown on each option and locked in when you pick; the winner is paid that locked value at the final. Falls back to the flat bonus if the FIFA ranking is briefly unavailable.

## [0.20.3] - 2026-06-11

### Fixed
- Anchor links (e.g. the footer version jump) no longer land under the sticky header - hash navigation is offset by the header height.

## [0.20.2] - 2026-06-11

### Changed
- The version number in the footer now links straight to that version's section in the about-page changelog.

## [0.20.1] - 2026-06-11

### Changed
- The fixtures filter is now opened on demand - a search icon next to "Fixtures" or Ctrl/Cmd+F reveals it, scrolls it to the top and follows the scroll; the icon shows an active state and toggles it off, Escape closes it. The field is debounced with a clear button.
- The Map view no longer shows the league pill (it has no league-scoped data).

## [0.20.0] - 2026-06-11

### Added
- The leaderboard now shows each player's best-scorer pick (team flag + 👟) beside their champion pick, with the full team / normalized player name in the tooltip.
- Admin: an "Apply auto-join now" action back-fills SSO league membership for all existing users whose email domain a linked provider captures (no need to wait for each to log in again), plus a total user count.
- The consensus bot's ghost row appears as soon as anyone has predicted (ranked last at 0 points pre-scoring), not only once it has scored.

### Changed
- Bookmaker odds are now OFF by default (opt-in); the preference and a tooltip explain 1X2 and decimal odds (1 = home win, X = draw, 2 = away win; lower = more likely).
- The "My Picks" page is gone - its standing boxes and the champion / best-scorer pick cards now live on the Matches page. The rank and player count honor the selected league.
- Leaderboard movement arrows now reflect only scoring changes, not roster churn (joining, going private, or being removed no longer nudges everyone).
- Player headshots come from UEFA for UEFA competitions and FIFA for the World Cup; the best-scorer player list shows attackers first.

### Fixed
- Broken avatars: a token-gated identity-provider picture (e.g. Microsoft Graph) is fetched once at sign-in and inlined, or replaced with the placeholder, instead of showing a broken image.
- Live scores and crowd totals auto-reconnect after a server restart instead of silently freezing; the match page gained the league pill.
- Champion / best-scorer flag alignment, the joker button's duplicate star, the admin manage-members modal (long names, a crash), and the leaderboard header overflow with a long league name.

## [0.19.1] - 2026-06-10

### Fixed
- Live scores and crowd totals now auto-reconnect after a server restart/deploy (shared reconnecting WebSocket with backoff, re-subscribing and refetching on reconnect) instead of silently freezing until the next navigation.
- The leaderboard falls back to the competition board (instead of showing an empty board) when a selected league was deleted or membership was revoked.

### Changed
- Crowd-bot consensus is briefly cached per (competition, league, method) to avoid recomputing the full prediction scan on every leaderboard view; league rank snapshots are written in one batched upsert per board.

## [0.19.0] - 2026-06-10

### Added
- Best scorer (Golden Boot): pick the player you think finishes the tournament's top scorer; at the final, everyone who picked a player tied at the top goal count (own goals excluded) gets a bonus, folded into the leaderboard total beside the champion pick. Picker with team/player selects and FIFA headshots, locked at the first kickoff like the champion pick.

## [0.18.0] - 2026-06-10

### Added
- Crowd bot: a synthetic "consensus" player whose pick each match is the crowd's most-common scoreline (MODE, falling back to a rounded average / MEAN below 5 predictors), scored by the real engine with joker, champion and rank. It shows as a ghost row on the leaderboard (toggle, per-competition or per-league) and a /bot detail page; upcoming-match consensus is admin-only. Display-only - it never changes anyone's real rank, and it is kept out of its own rarity-bonus denominator.

## [0.17.0] - 2026-06-10

### Added
- Leagues: competition-scoped player groups. Create your own (private with a shareable join code, or public so anyone can join and view its rankings), join several or none - predictions stay yours either way, leagues only filter the views.
- A league pill next to the competition switcher remembers your last selection per competition and scopes the leaderboard (third option in the scope toggle) and the crowd totals (league first, global behind a globe - the rarity bonus stays computed from everyone).
- `/leagues` page: manage your leagues (rename, copy/regenerate code, public/private toggle, promote moderators, transfer ownership, kick, leave, delete) and browse public leagues; `/leagues/:id` shows a league's standings - for public leagues even without joining.
- League roles: owner and moderators manage members and the join code; leaving or being kicked is remembered so SSO auto-join never re-adds anyone against their will.
- One-time prompt on first sign-in without a league: enter a join code, create a league, browse public ones, or skip forever.
- Admins manage every league (create, ownerless allowed, members, roles, visibility, delete) and SSO providers can auto-join their domain-captured users into chosen leagues on every login - the same league can hang off several providers.
- Private profile preference: step out of the global and competition rankings; only league mates (and admins) can open your profile, which answers 404 to anyone else. League boards still rank you for co-members and your predictions keep counting in the anonymous crowd totals.
- League boards show movement arrows (per-league rank snapshots, refreshed with the global ones) for members and admins; league crowd totals update live over WebSocket, delivered to that league's members only.
- The first player joining an ownerless league becomes its owner (code, public and SSO auto-joins alike); admins can still hand ownership to anyone. The last member leaving keeps the league alive - empty and reclaimable by its next joiner - and admins have an irreversible "Prune empty leagues" action to clean those up.
- Join-code attempts are rate limited (10 per minute per account).

## [0.16.0] - 2026-06-10

### Added
- Bookmaker odds: decimal 1X2 odds (Sofascore feed) under every score input - match cards, match page and editable picks - with an opt-out preference. Snapshots are append-only (identical re-polls skip the write); a scheduled task refreshes matches kicking off within two weeks (every 6h, every 30min in the last 2h before kickoff), and an admin backfill recovers closing odds for past tournaments (WC 2022, Euro 2024).
- The scoring engine's ODDS bonus mode is now live data-backed: when the active scoring config selects ODDS, finished matches score against the closing (pre-kickoff) odds of the actual outcome - backfilled closing odds trigger a rescore of already-scored matches. The default CROWD mode is unchanged.

### Changed
- Admin manual task triggers consistently bypass the cron kill switch (shared force gate); the long-running odds tasks return immediately ({started:true}) and report through the task tooltips instead of holding the request open past proxy timeouts.

## [0.15.2] - 2026-06-10

### Fixed
- Saving a prediction is now an atomic upsert: concurrent double-submits (autosave racing a manual save, a retry) no longer crash with a 500 on the unique (user, match) constraint - the loser updates the existing row instead.
- A failed SSO sign-in lands back on the login page with a flash ("single sign-on failed…") instead of dumping the user on the site root with raw `?error=` query params; the verbose identity-provider description (which can carry trace IDs) goes to the browser console only.

## [0.15.1] - 2026-06-10

### Fixed
- The hot-reload dev container keeps node_modules AND its build output (.nuxt/.output) in container-private volumes: its root-owned artifacts on the bind mount broke host-side pnpm/nuxt runs, and pnpm's no-TTY purge prompt could kill the container start.
- Admin user list: "Unlink from SSO" only appears for users actually linked to a provider (small link icon shows who is, with the provider ids in its tooltip), and admins can no longer demote themselves (it broke every admin query on the page mid-session).

### Added
- `mise run db-backup` / `mise run db-restore`: compressed pg_dump out of the dockerized Postgres into `backups/` and the matching (confirmed, destructive) restore - the missing piece for a nightly-backup cron.
- Forgejo-style footer on every page: app version (links to About), server/client page render time, a themed language switcher, a dark-mode toggle and the API docs link (moved out of the landing footer). The login/signup pages' standalone language/theme controls are gone - the footer covers them.

## [0.15.0] - 2026-06-09

### Added
- Identifier-first login with SSO domain capture: enter your email, Continue either redirects straight to your IdP or reveals the password field. `/login?password=1` skips capture (IdP-outage escape hatch for password accounts).
- SSO providers can capture several email domains (comma-separated, subdomains included); domains already captured by another provider are rejected.
- SSO providers can be edited in place from the admin page (type and provider id stay fixed; blank secrets keep their stored value; OIDC endpoints re-resolve from discovery on save).
- The admin SSO form shows everything the IdP side needs as it is filled: OIDC redirect URI, scopes and claims, SAML ACS URL, SP entity ID and a link to the generated SP metadata XML.
- Admins can hide any user from the leaderboard (eye toggle in the user list); hidden players keep playing and still count in crowd totals. `create-admin` accounts start hidden.
- Enter or space in a score input saves and hops home → away → next match, so a whole matchday can be typed without the mouse.

### Fixed
- An SSO sign-in whose email matches an existing password account now links to it (one merged account) instead of failing with account_not_linked.
- SSO-managed accounts (no local password) no longer see or can reach email change, password, 2FA or passkey management - the IdP owns those; enforced server-side too.
- Mobile: the FAQ scoring formula no longer forces page-wide horizontal scroll (it scrolls inside its own box), and the page-background gap between an opened FAQ question and its answer is gone.
- Mobile: the pinned title banner showed a few giant cropped letters (a 19:1 desktop strip cover-cropped to phone width) - fixed by the banner rework under Changed.
- Mobile: substitution rows no longer overflow the match timeline card; the form tab keeps scores on one line and tucks the competition behind the tappable (dotted-underlined) date.
- The mobile header nav signals its horizontal overflow with edge fades and scrolls the active link into view.

### Changed
- In-flight API requests are aborted when leaving a page or switching competition (vue-query signals, crowd totals, and the match page's slow FIFA-backed lazy fetches).
- SSO providers have an optional display name shown to players; SP metadata for a SAML provider can be downloaded before the provider is saved (the IdP side usually needs it first); domain-capture conflicts are now checked in both subdomain directions.
- Forgot-password flow: reset link from the login page (mail via SMTP), with better-auth creating the local password on reset - this is also the recovery path for users whose SSO provider was deleted. SSO-managed accounts never receive reset mails.
- Signing up with a password on an SSO-captured domain warns first (with the provider's display name) and requires an explicit "continue anyway".
- The SSO plugin's own HTTP provider-management endpoints (register/update/delete) are blocked; provider management goes through the admin API only.
- "SSO-managed" now means a still-registered provider: deleting a provider releases its users, who regain credential management and can set a password via the reset flow.
- A successful SSO sign-in removes the account's local password (the IdP becomes authoritative); the reset flow is the way back if the provider ever goes away. Admins can also unlink any user from SSO.
- The admin user list moved its per-user actions into a kebab menu (promote, hide, remove 2FA, unlink SSO, ban, delete) with inline status indicators.
- Admins are exempt from the SSO password nuke: their password is break-glass access for deleting a broken provider (ultimate fallback: `mise run create-admin` from the host).
- With SMTP configured, account deletion is confirmed through a mailed link (works for SSO accounts too - no more one-click deletion); without SMTP the password / fresh-session confirmation stays. The mailed link replaces the TOTP requirement, since it proves mailbox ownership.
- The landing banner is now one inline SVG for the whole scroll journey, with scroll-driven knobs instead of artwork swaps: the planet scales down in place to stay whole inside the shrinking bar, the subtitle fades out, and the title nudges down so it never clips. Any swap between the two differently-composed banner artworks read as the title jumping sideways; now nothing swaps.

## [0.14.0] - 2026-06-08

### Added
- `mise run create-admin <email> [name]` provisions an admin on demand: prompts for the password (hidden, never in shell history or the process list), signs up via better-auth (HIBP-checked + hashed), then sets the DB role; idempotent. No default admin password exists - this or NUXT_ADMIN_EMAILS bootstraps the first admin.

### Fixed
- UEFA match assists showed the beaten goalkeeper instead of the assister (a goal event's secondaryActor is the keeper); real assists are separate ASSIST events, now paired to goals by minute. Penalties correctly show no assist.
- UEFA own goals were never detected (marked as a GOAL with subType 'OWN', not type OWN_GOAL) - 0 recorded across Euro 2024 and each miscredited to the scorer's team; now detected, credited to the beneficiary, with the forcing player's assist.
- Admin import/sync now invalidates the client query cache, so a previously-loaded (e.g. empty) competition no longer keeps showing stale data until a manual refresh.

### Changed
- Dropped dead config (NUXT_MATCH_PROVIDER, NUXT_FIFA_SEASON_ID, NUXT_WC_SEASON): provider and season are per-competition (DB / live FIFA seasons API), the env vars were never read.

### Security / ops
- Postgres no longer publishes a host port in the prod compose base (the app reaches it in-network); host access for local dev moved to the dev overlay, bound to loopback. The app binds to 127.0.0.1 (put a reverse proxy in front).
- Slimmed the Docker build context so editing compose files, docs, scripts or tests no longer busts the build cache; removed an accidentally-committed curl cookie jar.

## [0.13.0] - 2026-06-08

### Fixed
- Crowd totals genuinely refresh on a competition switch now: the three consumers shared one static useFetch key, so Nuxt served the previous competition's cached payload. Rewritten as a plain ref + explicit refetch on (preference, competition) change; locked by a component test.

## [0.12.0] - 2026-06-08

### Added
- Component-test harness (@nuxt/test-utils): a `nuxt`-env Vitest project mounts components/composables with auto-imports + PrimeVue via `mountSuspended` (`pnpm test:components`, wired into the release gate and `mise check`).

### Changed
- God-components split, logic extracted to tested units. account.vue (558->421 lines): the 2FA enrol/disable/regenerate state machine is now `useTwoFactor` (8 tests) and passkey management `usePasskeys` (5 tests); image resize moved to `app/utils/image.ts`. The match view's timeline assembly and head-to-head tally moved to a pure `app/utils/match-view.ts` (unit-tested). The coverage gate stays on the node logic surface (98.3%); components are covered by their own suite.

## [0.11.0] - 2026-06-08

### Added
- `pnpm typecheck` gate (strict vue-tsc) wired into the release gate and `mise run check` - the type-safety net that was configured but never run. Client types (MyPrediction/MatchListItem/LeaderboardRow) now derive from the server query return types (via a `Serialized<>` helper), so they can't drift from the schema.
- Runtime request validation: a `defineValidatedHandler` wrapper (auth guard + Zod body parse + error mapping) on the prediction/joker/champion writes, making the OpenAPI schemas load-bearing (422 on bad input). Handler-level and auth-guard tests added.

### Fixed
- The finalize tick is now one atomic transaction (lock/unlock, scoring, champion awards, voids) - a crash mid-tick can no longer zero champion points or half-score a round.
- Several latent bugs the new typecheck surfaced: session `.value` access (the "you" highlight / authed flag were always falsy), predictions never selected penalties (pens never rendered on picks), prediction inputs coerced `undefined`->NaN.

### Changed
- Dedup + structure: shared provider stage ladder (one ordered table - fixes the fifa/uefa divergence), shared `getJson` envelope in the FIFA provider, `predictionHits` scoring predicate, `rowFromPerspective` h2h decode, `AppStage` helpers (`isSingleMatchStage`/`countsDouble`), semantic colour tokens (`--ng-star`/`--ng-danger`/`--ng-success`).
- Hardening: 2FA-delete hard-fails on a missing auth secret instead of decrypting against `''`; the encrypted-adapter no longer treats a corrupt sealed envelope as legacy plaintext; the scoring-config seed includes championBonus.

## [0.10.0] - 2026-06-08

### Fixed
- Crowd totals refresh when you switch competition (they were stuck showing "–" for the new competition's matches).
- Tech-stack cards mangled every third entry (monospace, tiny text): the card was an anchor with the license badge as a nested anchor - invalid HTML that Firefox split, leaking the badge style. Card is now a div with a stretched project link and a sibling badge link.

### Changed
- Prediction points reconcile with the joker/final multiplier: a "+N rarity" chip ("only X% picked this") plus a "×2" badge when the joker or the final doubled the score, so the breakdown matches the total.

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
