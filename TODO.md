# TODO

Deferred work, queued behind feature development.
Feature backlog with design notes lives in [ROADMAP.md](ROADMAP.md).

## Test debt

### Unit / handler coverage

- [x] Auth catch-all blocking lists (`server/api/auth/[...all].ts`): the
      `SSO_LOCKED` (change-email / passkey registration / 2FA enable for
      SSO-managed accounts) and `SSO_ADMIN_ONLY` (plugin's public sso
      register/update/delete) path guards are security-relevant and only
      manually tested. Extract the matching logic into a `server/utils`
      function (puts it under the 98% gate) or drive the handler via the
      sso-linking integration harness.
- [ ] Mail flows (forgot-password, delete-account confirmation): verified
      once by hand against maildev; nothing repeatable. The sso-linking
      harness pattern fits (pglite + production auth options + fetch-mocked
      SMTP transport, or assert on the `sendMail` calls).
- [ ] Admin SSO routes (register/edit conflict checks, sp-metadata for
      drafts, visibility, unlink-sso, sso-links): thin but admin-facing;
      a handler-level test file with a pglite db would cover the lot.

### E2E (the only one today is `pnpm e2e:smtp`)

- [ ] Identifier-first login: password reveal for local accounts, SSO
      redirect for captured domains, `/login?password=1` escape hatch.
- [ ] Signup domain-capture warning (continue anyway / use SSO).
- [ ] Password-reset mail flow end-to-end (request -> maildev -> reset ->
      sign in with the new password).
- [ ] Delete-account mail flow end-to-end (request -> maildev -> click ->
      account gone).
- [ ] Passkeys (needs a WebAuthn virtual authenticator; Firefox headless
      cannot - either chromium for this one test or skip).
- [ ] Prediction -> finalize -> leaderboard loop through the UI.
- [ ] Live WebSocket updates (crowd totals patch, live score + goal
      celebration).
- [ ] Real OIDC handshake against a disposable IdP (e.g. dockerized
      Keycloak/Authentik) - would also cover account linking and the
      password nuke in a real browser flow.

## Ops

- [x] Nightly backup cron on the host (pre-1.0 checklist):
      `0 4 * * * cd ~/repos/nostragoalus && mise run db-backup`, outdir on
      a different disk than the Postgres volume. (Confirmed 2026-06-13: prod
      has it; the dev host intentionally doesn't.)
- [ ] Worktree previews start without the gitignored `.env` (better-auth
      refuses its default secret, auth 500s): `mise run preview` could copy
      `.env` from the main checkout when missing, or at least fail loudly.

## Roadmap / home CTA / PWA (deferred from the feature passes)

- [ ] Roadmap admin reorder is two sequential PUTs from the client (swap with
      the neighbor); one failing leaves duplicate positions. A server-side
      swap/reorder endpoint fixes it and is a prerequisite for the kanban
      drag-and-drop (ROADMAP.md).
- [ ] Roadmap item content is single-language while the chrome around it is
      i18n'd in four locales; decide whether that's accepted (EN-only roadmap)
      or items grow per-locale fields.
- [ ] NextMatchCta duplicates the matches query under its own ['next-match']
      cache key (the landing page has no competition route param) and polls
      every 60s during live matches; the WS patcher only feeds
      ['matches', slug]. Unify the keys or subscribe the CTA to the socket.
- [ ] STATUS_BUCKETS (matches/index.vue) is a third MatchStatus grouping that can
      drift from statusSeverity/matchStatusLabel (format.ts), and isLive is
      hand-redefined in NextMatchCta/map/matches[id] (a 4th, exclusion-based copy
      lives in useLiveMatches). Centralise the status -> bucket/severity/isLive
      facts in one place (format.ts) so they can't diverge.
- [ ] PWA update flow (shipped in 1.5.0): the banner's two paths (build-manifest
      poll, waiting SW + controllerchange reload) were only verifiable by hand
      across local rebuilds - verify across two real prod deploys, and check iOS
      installed-PWA behavior specifically.

## Main page rework (deferred from the feature pass)

- [ ] The cue path (tap to skip the intro) latches the banner slim and lands
      content reliably on every viewport. Manual scrubbing is not as clean on
      very small phones: phase 1 is a fixed 420px, but a short viewport reaches
      the hero before that, so a hand-scroller sees the strip half-shrunk over
      the content between content-arrival and the dock/latch point. Fix is a
      screen-aware phase length (shorten SCRUB/PHASE2 on small viewports) or a
      mobile-simplified banner (static slim band, no scrub). Not worth the extra
      complexity until someone reports it.
- [ ] The intro re-expands only at the very top (scrollY <= 16). If that edge
      ever feels abrupt, widen it into a short easing band instead of a hard
      threshold.

## Email verification (deferred from the feature-treatment review)

- [ ] The email-verification flag cache (`server/utils/auth/email-verification.ts`)
      is a process-wide module `let cached`; tests rely on a beforeEach re-seed.
      A test that reads `emailVerificationRequiredSync` before seeding could see
      another suite's value (order-dependent flake, the class CLAUDE.md warns of).
      Expose a reset, or make the cache injectable.
- [ ] Verifying via the mailed link lands on `/matches`, dropping any `next` the
      user signed up with (e.g. a league-invite deep link): signup passes
      `callbackURL: '/verify-email'`, so the original `next` isn't carried through
      the verification round-trip. Thread `next` through verify-email.
- [ ] `users:prune-unverified` task doesn't check `cronDisabled` (consistent with
      finalize/fixtures, and self-gated on the verification flag) - if cron is
      disabled to halt jobs, the destructive prune still runs when the flag is on.
      Consider honoring the cron kill-switch for the destructive one.
- [ ] Sign-up enumeration hardening: with verification on, better-auth returns a
      token-less synthetic 200 for existing emails; with the admin + two-factor
      plugins adding user fields, set `customSyntheticUser` so the new-vs-existing
      response shape stays indistinguishable.

## Odds feature (deferred from the merge review)

- [ ] Provider-scope `match.oddsEventRef` (or prefix it `sofascore:`): switching
      a competition's odds provider would replay foreign ids into the new
      provider's namespace. Procedural for now: clear refs when switching.
- [ ] TEAM_NAME_ALIASES is in-code; a DB alias table (or an admin override to
      pin a match's event ref) would fix unmatchable names without a deploy.
- [ ] Extract the provider JSON envelope (rate limit + status mapping + json)
      shared by fifa/uefa/alltime-h2h/sofascore - sofascore is the 4th copy,
      now with extra knobs (403=rate-limit, 404 sentinel, parse-challenge).
- [ ] normalizeTeamName (odds matcher) vs searchable() (app/utils/format)
      duplicate diacritic folding with diverging special cases.
- [ ] RateLimiter.acquire is check-then-sleep; concurrent callers can fire
      together. A promise-chain queue would make the host spacing a guarantee.

## Leagues feature (deferred from the merge review)

- [x] Dedup the rank-snapshot pair: updateLeagueRankSnapshots/getLeagueRankMovements
      are verbatim copies of the global ones (snapshots.ts) - parameterize by
      table/scope. Same for the per-league fetch pipeline in useCrowdTotals
      (clone of the global block) and adminCreateLeague vs createLeague.
- [ ] Extract one resolveLeagueView(event, leagueId) guard helper - the
      getLeague/membership/admin/canView/competition-slug block is copy-pasted
      across leaderboard, crowd and league-detail routes (already drifted: the
      mutation routes 403 where the GETs 404, leaking league existence).
- [ ] Adopt defineValidatedHandler on the remaining hand-rolled league mutation
      routes - create/join/rename/transfer are converted; `[id]/index.delete`,
      `[id]/join`, `[id]/leave`, `[id]/members/[userId].delete` and
      `[id]/regenerate-code` still aren't - so toHttpError + future hooks apply
      uniformly; the user-facing delete currently 500s on a vanished league.
- [ ] "+N hidden" marker has two derivations that can drift: LeagueCard's roster
      uses `memberCount - members.length` while the leaderboard and league-detail
      pages use the server `hiddenCount` (useLeaderboardHiddenCount /
      countLeagueMembersHiddenFromBoard). Feed both from one source (return
      hiddenCount on the league-detail endpoint too).
- [ ] Public invite-preview route `/api/leagues/invite/[token]` is unthrottled,
      unlike the rate-limited accept/join routes. 96-bit tokens make brute force
      infeasible, but the join-code fallback path is enumerable; IP-key a limiter
      for parity. (Invite management routes also add 3 more copies of the
      getMembership+canManageLeague guard - folds into the resolveLeagueView item.)
- [ ] Share a LeaderboardRows component between /[competition]/leaderboard and
      /leagues/[id] - the league page copy dropped movement arrows + the
      champion crown (a feature gap: per-league movement is computed but unshown).
- [x] Scale: updateLeagueRankSnapshots is leagues x members sequential
      INSERT/UPDATE per finalize tick; getLeaderboard's champion query isn't
      league-scoped (fetches all picks for a 20-row board); publishLeagueCrowd
      fan-out scans all subscribers per league. Batch/scope when league count grows.
- [ ] WS auth is resolved once at socket open; a signed-out/expired session keeps
      its userId for the socket's life. Re-validate periodically or on a sentinel.
- [x] Dead endpoint: GET /api/me/league-prompt + shouldShowLeaguePrompt have no
      caller (the dialog derives visibility client-side); remove or wire up.
- [x] League leaderboard page shows an empty board (not an error) when the
      selected league was deleted/left until useMyLeagues refetches; clear the
      selection on a league fetch 404.
- [ ] Rate limiter is in-process per instance; multi-instance multiplies the
      join-code attempt budget (shared limiter / store needed if scaled out).

## League match standings (deferred from the feature-treatment review)

- [ ] `getMatchLeagueStandings` re-implements the league roster-with-visibility
      query (server/utils/leaderboard/match.ts) that already lives in
      `listLeagueMembers` (leagues/service.ts) - same private/hidden AND-clause and
      viewer-on-top `or`. Two sources of truth for "who is a visible member": share
      one helper so a visibility-rule change can't drift the per-match board from
      the league page.
- [ ] The "1224" rank-assignment loop in match.ts is a third copy of the inline
      block in `getLeaderboard` (leaderboard/service.ts); `compareLeaderboardRows`
      was extracted but this dense-skip step wasn't. Extract `assignRanks(rows)` so
      a tie-handling change lands once.
- [ ] The league-standings route adds another copy of the getLeague + membership +
      admin guard - folds into the existing `resolveLeagueView(event, leagueId)`
      helper item under the Leagues section.
- [ ] `needsProvisional` is field-global: a finished match recomputes provisionally
      for every member if any one still has null points. Safe today (finalize
      scores all locked picks for a match atomically, so it's all-or-nothing), but
      decouple per-row if partial finalize ever becomes reachable, so persisted
      final points are never overwritten by a recompute.
- [ ] `/api/matches/[id]/league-standings` is left out of the sampled API
      response-schemas (response-schemas.json): it's member/admin-gated and only
      returns rows for a seeded league + live match, so the public docs sampler
      can't reach it. Add it (with seed setup) if we ever document member routes.

## Crowd bot (deferred from the merge review)

- [x] getBotOverview runs on every request with no caching: it scans all
      competition predictions into memory, rebuilds per-match histograms on the
      read path, and re-runs getLeaderboard(limit:10000) for the rank. Identical
      per (competition, league, method) - wrap in a short-TTL cached function,
      or push MODE/MEAN to a SQL GROUP BY and precompute scores at finalize.
- [ ] insertGhostRow appends the bot to the end of a *paginated* board page when
      its rank exceeds the page; fine at friends-scale (<100) but misranks the
      ghost row on a partial page. Insert by rank against the full ordering.
- [ ] Bot rank reimplements the first four levels of compareLeaderboardRows
      inline; build a RankableRow and rank through the shared comparator so the
      ghost row can't drift from the real ladder. The 10000-row cap also
      silently truncates the comparison population.
- [ ] Dedup the bot endpoints' league-guard/competition-resolution preamble
      (resolveBotScope helper) and the client method-toggle + bot badge between
      leaderboard.vue and bot.vue.
- [ ] MEAN rounding uses Math.round (half-up bias on x.5 averages); consider
      banker's rounding or documenting the bias.

## Best scorer (deferred from the merge review)

- [ ] Champion and best-scorer are near-identical clones at every layer (pick
      service lock+upsert, idempotent award, the two leaderboard bonus-merge
      blocks, the picker SFC, the composable, both endpoints). Generalize into
      one "meta pick" mechanism (upsertMetaPick / awardBonuses(winnerWhere) /
      mergeBonus / <MetaPickCard> / useMetaPick) so a third bonus is config, not
      copy-paste. High-churn, touches the working champion feature - do as its
      own focused pass.
- [ ] topScorerPlayerIds drops goals with a null playerId; if a real top
      scorer's goals are partly unattributed the tie can be miscomputed. Picks
      match by playerId so it self-limits, but consider a playerName fallback or
      surfacing unattributed goals.
- [ ] topScorerPlayerIds loads all goal_event rows and counts in JS; a SQL
      GROUP BY/COUNT avoids the in-memory pass (it runs each finalize tick).
- [ ] Picker UI swallows save errors (no onError/toast - mirrors ChampionPick);
      a locked-race 409 or 422 is silent. Add inline error surfacing (and to
      ChampionPick) once there's a toast/error pattern.
- [ ] BestScorerPick watchEffect seeds the selects once (guard === null); a
      slow myPick load after the user touches the team select desyncs the
      dropdowns from the stored pick.
- [ ] The bot has no best-scorer consensus (only champion); consider a
      best-scorer consensus for parity, or document the asymmetry.

## Play-by-play (deferred from the feature-treatment review)

- [ ] timeline.get.ts duplicates live-detail.get.ts wholesale (imports, cache
      shape/TTL, the match-row select, the getCompetitionById ->
      resolveCompetitionSeason -> providerForCompetition ladder). Extract a
      shared resolveMatchProvider(id) (or a withMatchProviderCache helper) so
      the two endpoints collapse to their unique provider call and can't drift.
- [ ] TIMELINE_ICONS / GOAL_KINDS in matches/[id].vue hand-mirror the server's
      TimelineEventKind union and FIFA_EVENT_KINDS goal set; a new/renamed kind
      silently falls back to the bullet and (for goals) loses bold + the score
      column. Share the kind list / goal-kind set from shared types.
- [ ] (i18n pass) PBP_PLAYER_KEYS / KIND_LABEL_KEYS / PERIOD_KEYS in
      matches/[id].vue are hand-maintained kebab->camel identity maps that can
      drift (a kind added to KIND_LABEL_KEYS but missing from PBP_PLAYER_KEYS
      silently renders the nameless fallback). Derive the camel key from the kind
      instead of three lookup tables. Also: getMatchTimeline overloads `language`
      as both the fetch param and the VAR-text gate - a caller passing a
      feed-unsupported language would surface un-localized VAR text; the
      en/fr allowlist lives only in the endpoint. Consider an explicit
      { language, localizeText } or moving the allowlist into the provider.
- [ ] (UEFA) VAR decision text is English-only: UEFA's events feed does not
      localize freeText (verified - `&language=fr`/`&lang=fr` return identical
      English), so fr/th/tlh fall back to the generic "VAR" label while en shows
      the decision. Revisit if UEFA localizes it, or translate the common
      decision phrases ourselves.
- [ ] (UEFA) normalizeUefaTimeline drops free-kicks, corners, saves, offsides
      and the bare VAR review-step markers (no TimelineEventKind for them). Add
      'corner'/'save' kinds (icons + i18n) if wanted, and fold the VAR markers
      into the decision line rather than dropping them.
- [ ] (UEFA) getMatchTimeline re-fetches /events even though the route already
      pulled the same feed via getMatchDetail; thread the events through (or
      cache them) to avoid the double fetch.
- [ ] normalizeUefaTimeline (uefa.ts) and normalizeFifaTimeline (fifa.ts) are now
      two implementations of the same TimelineEvent contract (FIFA table-driven,
      UEFA a hand-rolled switch). The cross-cutting rules - own-goal side flip,
      VAR-text language gate, the trailing reverse-to-newest-first, drop-unmapped-
      period - are encoded twice and can drift. Extract a shared buildTimelineEvent
      + the policy helpers; keep the per-provider kind tables. Caveat for the
      extractor: UEFA derives the running score and second-yellow locally (its feed
      stamps only the final score), where FIFA reads them off the feed - the seam
      needs a per-event derivation hook, not a 1:1 merge.

## Admin panel redesign (deferred from the feature-treatment review)

- [ ] Sections render with `v-show`, so all of them mount on `/admin` load and
      every section's query fires eagerly (enabled: isAdmin) - including the now
      folded-in `/api/admin/cron`, which used to fetch only when you visited
      `/admin/cron`. Gate each section's fetch on being the active section (or
      lazy-mount the hidden ones) so opening the default section doesn't fan out
      6+ admin round-trips. AdminCronSection's 30s `useTimestamp` tick also runs
      for the whole admin session even while hidden.
- [ ] AdminCronSection uses `useFetch(..., { immediate: props.isAdmin })` - read
      once, non-reactive, unlike the sibling sections' `enabled: computed(() =>
      props.isAdmin)`. Fine today (parent awaits isAdmin before render) but
      fragile to render-order changes; make it reactive for consistency.
- [ ] The rail count badges use a `counts: Record<string, {total,loading}>`
      keyed by nav key (only users/leagues populated); a key typo silently drops
      a badge with no type error. Put total/loading on the navItems entries
      instead. Also: the leagues badge total comes from a separate
      ['admin-leagues','options'] query while AdminLeaguesSection runs its own
      ['admin-leagues', slug] query - two fetches of /api/admin/leagues that can
      diverge/stale after a create-delete if only one key is invalidated.


## Done (post-merge correctness pass)

- [x] WS auto-reconnect with backoff + re-subscribe/refetch on reconnect
      (shared useReconnectingSocket; live scores + crowd no longer freeze after
      a deploy/restart). [partial on the bot perf item: TTL cache added; SQL
      GROUP BY aggregation + the 10000-row rank cap still open.]

## Second chance (deferred from the feature pass)

- [ ] (feature-treatment) The `/api/champion` doc schema (server/utils/docs/
      response-schemas.json) is stale: the GET now returns `secondChance` and
      `myPick.repicked`/`original*`, not yet reflected. A bulk `node
      scripts/gen-api-schemas.mjs` also rewrites ~15 other endpoints' example
      values from current live data (drift), so do a controlled regen on a
      stable dataset (or patch just the champion block) rather than bundling the
      churn.

- [ ] The re-pick window is defined on `round_kind` (last GROUP_MATCHDAY round
      kickoff -> first KNOCKOUT kickoff). This assumes a future esports importer
      maps Swiss/group stages to GROUP_MATCHDAY and the playoff bracket to
      KNOCKOUT. If esports rounds get their own `round_kind`, revisit
      `getSecondChanceWindow`. Also: Play-Ins would shift the champion-pick
      *lock* (first kickoff) - separate decision when esports lands. And
      best-scorer (Golden Boot) has no esports equivalent, so the second chance
      there is football-only until an MVP-style meta-pick exists.
- [ ] (feature-treatment review) Pick targets aren't validated against the
      competition: champion `teamCode` and best-scorer `playerId`/`teamCode` are
      only length-checked (zod), never cross-checked against listCompetitionTeams
      / the squad, on both the set and repick paths. Low risk today (an unknown
      code never matches a winner, and the eventual top scorer isn't known at
      pick time), but validating against the real teams/squad would reject junk
      picks. Pre-existing on the base set paths; the repick paths inherit it.
- [x] setChampionPick now upserts (onConflictDoUpdate), race-safe like
      setBestScorerPick and both repick paths. Remaining (low): the repick
      update-branch original* snapshot is still a non-atomic read-modify-write -
      harmless today since concurrent first-switches write the same original.
- [x] getSecondChanceWindow now warns when end <= start (inverted window from
      bad fixture data); isSecondChanceOpen already returns false, so the feature
      no longer disables itself silently.
- [x] (partial) The half-points rule is now one helper (`halvePickPoints` in
      app/utils/format) behind both pickers' worth display, and both halve a
      *previewed* pick during the window - champion's late-first-pick preview no
      longer shows full worth while the server halves it. Remaining: the deeper
      meta-pick generalization (repickChampion == repickBestScorer, the
      secondChance GET shape + repick PUT dispatch, and the two award-SQL forms)
      folds into the "Best scorer" meta-pick item above.

## Champion tiers (deferred from the merge review)

- [x] ~~Pre-feature champion picks backfilled to potential_points=10~~ Moot
      since 2026-06-11: champion picks locked at the first WC kickoff with the
      legacy +10 values in place - no re-snapshot is possible anymore. Lesson
      for the next competition: re-snapshot legacy picks before lock.
- [ ] FIFA rank cache is per-process with a 12h TTL: across a FIFA publication
      boundary (or multiple server instances) two users can snapshot different
      ranks for the same team. Bound max staleness / invalidate on publication
      if it matters.
- [ ] ChampionPick: a saved pick shows its locked snapshot worth while the
      dropdown/team list shows the live tier - the same team can display two
      worths after ranks move. Label the snapshot ("locked") to disambiguate.
- [ ] Bot champion payout is the mode of pickers' snapshots (ties low) and is
      dragged by backfilled-10 legacy picks; revisit if the bot's champion
      points look off.
- [ ] Extract the shared provider getJson envelope (rate-limit + 429/403 +
      json-guard) now duplicated across fifa, sofascore and fifa-ranking; and a
      generic ordered-tier resolver for crowd/odds/champion tiers.

## Match watch links (deferred from the feature pass)

- [x] Machine auth (built on feat/api-keys): @better-auth/api-key plugin (suite
      bumped 1.6.14 -> 1.6.18; apikey table hand-authored in auth-schema since no
      CLI was available, proven by an integration test). `defineValidatedHandler`
      accepts `apiKey:{resource:[perms]}` - an x-api-key is verified, the owner
      loaded, and required to be an admin for admin routes; session guards strip
      x-api-key so a key never implicitly resolves a session. The media routes
      still need to opt in with `apiKey:{media:['write']}` when feat/match-media
      merges.
- [x] Admin API-client UI (built on feat/api-keys): admin-page section to mint
      scoped/expiring keys (plaintext shown once), list and revoke. NOT yet
      2FA-gated for the mint action - revisit if minting needs step-up auth.
- [ ] Curation bot (separate repo, keeps grey-zone sourcing out of this app):
      cron reads `/api/matches` for fixtures in the next N hours, finds links,
      POSTs them near kickoff (header-check X-Frame-Options before setting
      embeddable=true); after FINISHED, finds replay/highlights (more often on
      whitelisted/legit hosts) and clears dead LIVE links.
- [ ] No edit endpoint: media edits are delete + re-add. Add a PUT only if
      inline relabel/retarget becomes worth the surface.
- [ ] `embedSrcFor` falls back to the raw URL for a force-embedded
      non-whitelist host - revisit if a sandboxed raw embed proves too hostile
      (popunders/redirects); could restrict force-embed further.

## SSO / better-auth 1.6.18 (deferred from the api-keys upgrade)

- [ ] SSO domain ownership verification (DNS TXT): deliberately NOT added. SSO
      providers are registered by site admins only, so domain-ownership proof
      would gate an actor who's already fully trusted (single-tenant model) - it
      buys nothing today. The plugin ships the primitives (domainVerification
      token endpoint + verify flow). Add only if provider registration is ever
      delegated to a less-trusted role or the app goes multi-tenant; then make
      new providers start domainVerified=false and grandfather existing ones
      (already default true). Cheaper interim guard against accidental capture
      (admin fat-fingers a public domain): warn/block well-known freemail
      domains (gmail.com, outlook.com, ...) at registration.
- [ ] History: commit 6d8f8a7 (trustEmailVerified) is superseded by 3db9e9a
      (domainVerified); squash the two during the feature-treatment rebase.

## Scoring config (deferred from the feature pass)

- [ ] The result-rarity layer is folded into `prediction.bonusPoints` (no
      schema change). If the UI ever needs to show the two layers separately
      (exact-rarity vs result-rarity), persist the split - add a column rather
      than re-deriving at read time.
- [ ] A scoring save recomputes prediction points + rank snapshots, but
      champion and best-scorer bonuses are pick-time snapshots and are NOT
      retroactively re-valued by a config edit (changing `championTiers` /
      `bestScorerBonus` only affects future picks / the next finalize award).
      Decide if a config edit should also re-award those, or document it as
      intended.
- [ ] Existing installs get `crowd_outcome_tiers` = null on migration (layer
      off); only fresh installs ship it on. There is no UI hint that the
      default has the layer off - the admin discovers it by opening the page.
      Consider a one-time "new: result-rarity layer" nudge, or a backfill if we
      decide every deployment should get it.
- [ ] No optimistic-lock / version check on the admin save: two admins editing
      the same scope concurrently last-write-wins (each bumps the global
      version, so no data corruption, just a lost edit). Add an "expected
      version" guard if it ever matters.
- [ ] `recomputeCompetition` rescores serially per match inside the save
      transaction. Fine for a tournament's match count; if a competition grows
      large, batch the prediction updates or move the recompute off the request
      path (job + progress).

### Deferred from the feature-treatment review

- [ ] The rules->row WRITE mapping has two copies: `rowValuesFromRules`
      (admin.ts) and the inline insert in `ensureDefaultScoringConfig`
      (store.ts). They must stay identical; adding a scoring column means editing
      both plus `rulesFromConfigRow` (config.ts). Extract one `rulesToRowValues`
      helper beside `rulesFromConfigRow` and use it in both - else the seeded
      default can silently drop a new column while overrides carry it.
- [ ] `championPointsForRank` (config.ts) added a third hand-rolled copy of the
      ordered-tier resolver (alongside `crowdBonus`/`oddsBonus`). Folds into the
      already-listed generic ordered-tier resolver item above - boundary
      comparisons differ (`<` vs `<=`) so they can drift.
- [ ] `AdminScoringSection.vue` redeclares `CrowdTier`/`OddsTier`/`ChampionTier`
      and a local `Rules` interface already exported as `ScoringRules` from
      `shared/types/scoring.ts`, and hard-codes default tier literals from
      config.ts. Import the shared types so a server-side shape change is caught
      by the compiler instead of silently dropping a field on save.
- [ ] `ScoringContext` (finalize.ts) is structurally identical to
      `ActiveScoringConfig` (store.ts) (`{ version, rules }`); admin.ts passes an
      `ActiveScoringConfig` where a `ScoringContext` is expected and it only
      type-checks by coincidence. Share one type.
- [ ] On a DEFAULT-config save, `recomputeCompetition` re-resolves
      `getScoringConfigFor` once per competition inside the transaction even
      though they all use the just-saved default. Pass the resolved default down
      to avoid N config SELECTs (lock-hold time on large competition sets).
- [ ] Empty tier arrays are accepted by the zod schema (length now capped at 50,
      but `.min` is 0): an empty `crowdTiers` silently disables the crowd bonus
      with no error. Either require `.min(1)` or document "empty = layer off".
- [ ] The admin scoring mutations (PUT/DELETE) trigger a full recompute and have
      no rate limit. Admin-only and transactional, so blast radius is a
      self-inflicted DB load spike - revisit only if it bites.
