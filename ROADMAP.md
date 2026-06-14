# Roadmap

Agreed feature backlog with design notes, so decisions aren't lost. Rough
effort buckets; order within a bucket is not priority.

## Up next

- [x] **Roadmap page (MVP)** (shipped in 1.1.1): admin-filled items with
      status (planned / in-progress / shipped), public `/roadmap` page,
      `mise run roadmap-add` / `roadmap-seed` CLI. User suggestions +
      upvotes deferred to v2 (see Features below).

## Quick wins

- [x] **Auto-refresh on new version** (shipped in 1.5.0): Nuxt built-in
      (`app:manifest:update` hook / `checkOutdatedBuildInterval`), toast "new
      version available, reload?".
- [x] **League invite links** (shipped in 1.6.0): 96-bit tokens, optional expiry + max-uses, owner/moderator mint/
      revoke. Public `/leagues/join/[token]` previews the league signed-out and
      bounces through login via a same-origin-guarded `?next=`, auto-accepting
      on return. Accept is atomic (conditional use-increment gates the cap).
      Reuses the existing addMembership join path (ownerless-league claim, opt-
      out clear). Kept the short join code too - the link is the easy path, the
      code the fallback.
- [x] **Per-match league standings** (built on worktree-match-standings,
      pending merge): a "League" tab on the match page ranks the selected
      league's members by the points their pick scores on that one match.
      Decisions: reuse the finalize scoring engine for live matches
      (provisional, scored at the current scoreline), persisted points once
      finished; the crowd-rarity bonus stays measured against the whole field,
      only the displayed rows are league-scoped (mirrors the league crowd
      totals). Picks hidden until kickoff (server scope 'upcoming', no rows) so
      it can't leak picks - same copy-protection as everywhere else. League
      leaderboard visibility rules (admin-hidden dropped except self, private
      profiles for members/admins only); non-predictors shown as a muted count.
      Refreshed off the existing live-score watch + 45s poll, no new socket.
- [ ] **Changelog since-last-seen**: store last-seen version per user, badge
      dot on the changelog nav entry, highlight the delta section.
- [x] **Next-match CTA** (shipped in 1.4.0): on the home banner when logged in; scrolling
      dismisses it, and a dismissed match doesn't re-show (sessionStorage).
- [ ] **Main page rework** (in progress on worktree-main-page-rework): a rolling
      refresh of the landing/home page so it gets you to the matches and your
      picks faster and shows its best side. Multi-slice; the banner intro is the
      first slice, more below.
  - **Banner intro (done, pending merge)**: the scroll-scrubbed banner journey
        (centered card -> full-bleed strip -> slim pinned bar) buried the
        essentials below a decorative banner, and the slim state existed only at a
        single scroll position so reading the page re-expanded it. Adds a
        viewport-anchored scroll cue (fixed bottom-center, reduced-motion safe,
        hidden while the next-match pill shares that slot) that latches the banner
        slim and scrolls the hero just under it - content-relative, so it lands the
        same on any viewport. Once docked (cue or manual scroll) the bar holds slim
        until the page returns to the very top. Deferred: on very small phones a
        manual scrub still half-shrinks the strip over the content; a screen-aware
        phase length or a mobile-simplified banner would close that (TODO.md).
  - **Planned slices** (from the product discussion, refine as we go): logged-out
        value-prop + sign-up/login CTA in the hero; a live teaser even when signed
        out (next-match card, leaderboard top 3, player count); conditional-by-auth
        landing so returning users skip the big intro / start on a slim bar.
- [ ] **iCal feed**: per-user calendar subscription with fixtures + pick
      lockout deadlines.
- [ ] **"The Equalizer" bot mode**: always picks 1-1 (modal draw score) to
      leverage the draws-score-something floor. Verify the "draw pick always
      >= 2 pts" premise against the tier table first; if outcome-miss = 0 the
      bot is terrible, which is also funny - ship either way.
- [ ] **Evil twin**: derived view, zero schema - your twin picked the swapped
      score of every prediction; see how it fared. Draws are self-twins by
      design; one-line tooltip ("even your evil twin agrees") instead of a
      rules paragraph. Exact draw handling still TBD (swap vs crowd-derived).
- [x] **Email verification for signups** (admin runtime toggle, shipped in 1.8.0):
  - Flag in a new generic `app_setting` key-value table (the SSO config path
    is its own encrypted table; a plain boolean didn't need that). better-auth
    1.6.14 reads `requireEmailVerification` live per request (verified it's
    never captured at init), so it's exposed as a **getter** over a synced
    in-memory cache - the toggle takes effect with no redeploy, no sign-in
    hook needed. `emailVerification.sendVerificationEmail` always configured.
  - Toggle gated on SMTP (`NUXT_SMTP_URL`); enabling without it is refused.
  - Grandfather: enabling sets every existing account `emailVerified = true`
    (done in the service, so no hand-written data migration).
  - SSO sign-ins exempt for free - the gate lives only in the email/password
    sign-in route; SSO uses a different route and arrives verified.
  - Admin **force-verify** action on any unverified user, in the user row menu.
  - Unverified-account TTL: daily `users:prune-unverified` task deletes
    `emailVerified = false AND createdAt < now - 7d`, exempting SSO-linked and
    admin accounts, and self-gating to a no-op unless verification is required
    (otherwise unverified is the normal state and it would wipe everyone).

## Features

- [ ] **Match watch links** (built on feat/match-media, pending merge): admin/
      bot-curated Live / Replay / Highlights links per match, shown in a Watch
      section on the match page. Decisions: a `match_media` child table (kind +
      url + label + nullable `embeddable` override); a host whitelist
      (YouTube/Twitch/Dailymotion/Vimeo) sets the embed default AND the
      URL->embed-src transform, the override forces embed/link-only for any
      host; whitelisted or force-embedded links play in a sandboxed iframe with
      a permanent open-in-new-tab fallback (a host's X-Frame-Options can't be
      overridden), everything else is an external button. LIVE shows
      pre/in-match, replay+highlights once FINISHED. Public read
      (`GET /api/matches/[id]/media`) + admin write; grey-zone link sourcing
      stays out of the app, so liability sits with whoever sets the link.
      Machine auth (the `apiKey` plugin + admin API-client UI) is now built on
      feat/api-keys; the media routes opt into `apiKey:{media:['write']}` once
      both branches merge. Still deferred: the separate curation bot that fills
      links via the API (see TODO.md).
- [ ] **Pick reminders + web push** (installable PWA + offline shell shipped in
      1.5.0; install prompt and push still pending): `@vite-pwa/nuxt`; web push
      (iOS >= 16.4 for installed PWAs). Push pays for itself twice: lockout
      reminders for missing picks + goal alerts on predicted matches. Ship before
      any native wrapper.
- [ ] **Tournament Wrapped**: end-of-competition personal recap - best/worst
      pick, joker efficiency, percentile, biggest rarity bonus - with a
      shareable image card. Pure read-side work.
- [ ] **What-if stats**: "joker on match X = +14 pts", "following the crowd
      would have scored N vs your M" (reuses consensus-bot data).
- [ ] **Personal analytics page**: bias detector - avg goals predicted vs
      real, favorite-team optimism, accuracy by group/team/round.
- [ ] **Bracket challenge**: predict the full knockout tree before R16 lock,
      separate points pot. Bracket rendering already exists.
- [ ] **Survivor side game**: one team per matchday, must win, no team reuse,
      last alive wins. Tiny schema.
- [ ] **Achievements / trophy cabinet**: global only, computed from
      competition-level data (never league-relative - kills farm leagues by
      construction). Ideas: prediction sniper, exact-score streaks, "heretic"
      (alone against the crowd and right), wc champ (your champion won),
      wc overall champ (top of a competition ladder), playmaker (your best
      scorer won), averager.
- [ ] **Match reactions**: fixed emoji palette (nothing to moderate), 1 per
      user per match, counts league-scoped by default; global counts as a
      possible later toggle.
- [ ] **League trash-talk threads**: only if leagues ask for it after
      reactions ship. Private leagues only, league owner + existing moderator
      role can delete/mute, no global surface ever.
- [ ] **Hall of shame (per pick, not per player)**: "shame of the round" -
      one per matchday so nobody is dogpiled tournament-wide. Shameable =
      wrong outcome (a miss) AND max total goal error (|dHome| + |dAway|);
      right-outcome-huge-error is comedy, not shame. Jokered = bonus shame.
- [x] **Second chance for champion / best scorer** - built on
      worktree-second-chance, pending merge:
  - Window: **last group round -> first knockout** (option 2), not the whole
    first-kickoff -> R16 span. The re-pick only has info value once the groups
    have played out, and opening at the start of the last group round (WC26
    MD3) still gives a multi-day window - sanity-checked it stays multi-day for
    esports too (LoL Swiss->quarters, CS Legends->Champions, ~1-5 days).
    Defined on `round_kind` (last GROUP_MATCHDAY round kickoff -> first KNOCKOUT
    kickoff) so it adapts per competition shape; no window without group or
    knockout rounds.
  - First re-pick latches a permanent `repicked` flag -> award halved
    (integer-floored) at finalize, even if the user reverts (changing back is
    on him). The original* columns keep the pre-switch pick for display.
  - Confirm modal spells out the permanence; the original shows beside the new
    pick, and the worth display halves for a re-picked pick.
  - Same mechanic for best scorer. Requires an existing pick (no original ->
    no second chance); a user who never picked before lock can't use it.
- [ ] **Roadmap v2 - user suggestions + upvotes** (MVP page is in "Up next"):
      suggestions feed the roadmap, roadmap items get user upvotes. One
      schema, two views. CLI pull command for suggestions. Spam guard: auth
      required + rate limit.
- [ ] **Roadmap as kanban board**: render the /roadmap page as columns per
      status (planned / in progress / shipped) instead of stacked sections;
      admins drag cards between columns and reorder within one (replaces the
      up/down buttons). Public view read-only.
- [ ] **Half-time prediction change ("the VAR")**: overturn your own call on
      a live match before the second half kicks off.
  - League house rule behind a new per-league **difficulty setting**; off by
    default, league owner enables.
  - One change per round (same scarcity as the joker) - a rescue flare, not
    a strategy.
  - Penalty: changed pick scores **floor(base pts / 3)** - with the current
    tier table only an exact second-half read scores at all (3->1, 2->0,
    1->0). Floor, not round: the design intent lives in that rounding rule.
  - **No rarity/odds bonus** on a changed pick: rarity is measured against
    the pre-match crowd the new pick was never part of (and closing odds
    price uncertainty you no longer face) - paying it would hand hindsight
    a bonus. Net effect, the one-sentence rule: a VAR'd pick is worth
    exactly 1 point on an exact score, 0 otherwise.
  - Changing **burns the joker** (no refund): the joker is a pre-match
    confidence bet; mid-match edits forfeit it. Uniform penalty, kills the
    "joker every round, adjust at HT" exploit.
  - No honors on changed picks: excluded from achievements/badges/rewards.
  - Original pick retained and shown alongside the new one.
  - Scoring model: ONE global change per user (no per-league predictions -
    they'd poison crowd totals, rarity and storage). Finalize computes both
    values (original points, changed points); league boards with the rule ON
    rank on the changed value, leagues with it OFF and the **global board
    always rank on the original** - global stays a pure pre-match game.
- [ ] **Match line-ups**: starting XI + bench (+ formation if the feed has
      it) on the match view, sourced from the existing data providers.
      Squad/player pages already exist to link into.
- [ ] **League rewards + "My fridge"**: league owner attaches real-world
      stakes to the season ("most exact scores -> bottle of Saint-Emilion").
  - Criteria from a **curated, auto-computed list only** (league winner,
    most exact scores, best matchday, most jokers converted, ...); reward is
    free text. No custom criteria - everything resolves from data.
  - Awarded automatically at competition end; the app tracks honor, humans
    hand over the bottle (no in-app transactions, it's a social contract).
  - **"My fridge"** page: every reward you've won across leagues, because
    arguably you're winning wine bottles.
- [ ] **Prune inactive users** (admin):
  - Users with predictions are load-bearing (historical rankings, crowd
    totals, rarity): **anonymize, never delete** - keep picks/points under
    "Deleted player", drop PII (reuse the account-deletion flow's logic).
  - Hard-delete only zero-content accounts (no picks ever) after long
    dormancy.
  - "Inactive" must span the 4-year cycle: roughly no login for ~3 years,
    i.e. missed an entire competition cycle they were registered for.
  - Warning email + 30-day grace before acting.
- [ ] **Multi-season / multi-competition leagues**: `league_competitions`
      join table, backfill migration from the current column (leagues are
      live in prod). "Extend" action on a league, cancellable as long as no
      pick has been scored in the newly added competition.

## Big rocks

- [ ] **League import from other services** (MPP first):
  - Spike the source format first: MPP has no public API - figure out what
    an owner can actually export/hand us before designing the importer.
  - Member mapping: **email first, claim-link fallback** - auto-attach to
    existing accounts when the export has emails; everyone else becomes a
    ghost member (display name + imported standing) holding a claim
    link/code the owner distributes; claiming binds a real account.
  - Imported standings are historical flavor (shown on the league), not
    points in our ladder - scoring systems don't translate.
- [ ] **More competitions**:
  - Spike order: UCL 2025-26 first (check the UEFA API covers it; cheap test
    of long-format comps in the round model), then EU top-5 leagues, then
    rugby (WC + 6 Nations), then LoL Worlds / CS majors.
  - Rugby: closeness tiers need retuning (27-24 scorelines, rare draws);
    sport switch drives theme or at least logo.
  - Esports: series scores (3-1 in maps) fit the existing score model.
  - UX: the default never changes - football internationals, zero questions
    asked, no onboarding quiz. Per-user **followed competitions** set; pill
    switcher shows followed + "more..." browser; following is the lazy
    opt-in. Long club comps default to a **featured view** (top-table
    clashes + the user's followed teams), full matchday behind a tab.
    Picking stays optional per match; rankings stay total-points.
- [ ] **Mobile / desktop apps** (tech showcase, no store publishing planned):
  - PWA first regardless (see push above).
  - Then **Tauri v2** for both desktop and mobile (single framework, small
    binaries, system webview) - better showcase than Capacitor + a separate
    desktop stack. Capacitor remains the boring-proven fallback if Tauri
    mobile bites.
  - Electron / Neutralino / Electrobun ruled out (size / ecosystem /
    maturity).
- [ ] **Tamper-evident / E2EE scores**:
  - Ship first: **commit-reveal** - hash(prediction + salt) stored at pick
    time, reveal at lock, anyone can verify admins didn't retro-edit. Keeps
    the global leaderboard, no key-management UX.
  - Opt-in per-league **E2EE tier** as the hardcore showcase: client-side
    scoring, league-shared key (HKDF-derived from a league master key).
    Known costs: key distribution on join, key loss bricks the league, and
    server-blind leagues lose crowd totals / bot / global board.
- [ ] **SCIM provisioning**: pairs with the SSO story (deprovisioning is the
      real enterprise ask). Survey the better-auth ecosystem before
      hand-rolling. Low priority until an actual IdP user exists.

## Dropped / rethink

- **Arrow-key score navigation**: dropped - up/down must stay native input
  increment; enter/space already covers the flow.
- **Live admin commentary**: needs a rethink - it's an ops commitment (a
  human typing through 104 matches), and admin-as-player risks perceived
  unfairness/toxicity. X embeds are dead/paid API. Existing goal timeline +
  WebSocket already covers "live"; a per-match admin-pinned announcement is
  the reduced form if revisited.
