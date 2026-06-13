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
- [ ] PWA update flow (worktree-pwa-auto-refresh, once merged): the banner's
      two paths (build-manifest poll, waiting SW + controllerchange reload)
      were only verifiable by hand across local rebuilds - verify across two
      real prod deploys, and check iOS installed-PWA behavior specifically.

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


## Done (post-merge correctness pass)

- [x] WS auto-reconnect with backoff + re-subscribe/refetch on reconnect
      (shared useReconnectingSocket; live scores + crowd no longer freeze after
      a deploy/restart). [partial on the bot perf item: TTL cache added; SQL
      GROUP BY aggregation + the 10000-row rank cap still open.]

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
