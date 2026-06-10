# TODO

Deferred work, queued behind feature development.

## Test debt

### Unit / handler coverage

- [ ] Auth catch-all blocking lists (`server/api/auth/[...all].ts`): the
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

- [ ] Nightly backup cron on the host (pre-1.0 checklist):
      `0 4 * * * cd ~/repos/nostragoalus && mise run db-backup`, outdir on
      a different disk than the Postgres volume.

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

- [ ] Dedup the rank-snapshot pair: updateLeagueRankSnapshots/getLeagueRankMovements
      are verbatim copies of the global ones (snapshots.ts) - parameterize by
      table/scope. Same for the per-league fetch pipeline in useCrowdTotals
      (clone of the global block) and adminCreateLeague vs createLeague.
- [ ] Extract one resolveLeagueView(event, leagueId) guard helper - the
      getLeague/membership/admin/canView/competition-slug block is copy-pasted
      across leaderboard, crowd and league-detail routes (already drifted: the
      mutation routes 403 where the GETs 404, leaking league existence).
- [ ] Adopt defineValidatedHandler on the hand-rolled league mutation routes
      (join/leave/kick/regenerate/delete) so toHttpError + future hooks apply
      uniformly; the user-facing delete currently 500s on a vanished league.
- [ ] Share a LeaderboardRows component between /[competition]/leaderboard and
      /leagues/[id] - the league page copy dropped movement arrows + the
      champion crown (a feature gap: per-league movement is computed but unshown).
- [ ] Scale: updateLeagueRankSnapshots is leagues x members sequential
      INSERT/UPDATE per finalize tick; getLeaderboard's champion query isn't
      league-scoped (fetches all picks for a 20-row board); publishLeagueCrowd
      fan-out scans all subscribers per league. Batch/scope when league count grows.
- [ ] WS auth is resolved once at socket open; a signed-out/expired session keeps
      its userId for the socket's life. Re-validate periodically or on a sentinel.
- [ ] Dead endpoint: GET /api/me/league-prompt + shouldShowLeaguePrompt have no
      caller (the dialog derives visibility client-side); remove or wire up.
- [ ] League leaderboard page shows an empty board (not an error) when the
      selected league was deleted/left until useMyLeagues refetches; clear the
      selection on a league fetch 404.
- [ ] Rate limiter is in-process per instance; multi-instance multiplies the
      join-code attempt budget (shared limiter / store needed if scaled out).

## Crowd bot (deferred from the merge review)

- [ ] getBotOverview runs on every request with no caching: it scans all
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
