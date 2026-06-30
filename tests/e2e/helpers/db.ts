import { Pool } from 'pg'

// Direct DB access for the browser e2e: the app has no admin route to set a
// match score, and the predict flow needs a deterministic, namespaced fixture
// (its own competition + a future-kickoff match) rather than the live WC data.
// Self-contained raw SQL (no drizzle/#shared imports, which Playwright's runner
// can't resolve) against the running dev Postgres.
const CONNECTION =
  process.env.E2E_DATABASE_URL ?? 'postgres://nostragoalus:nostragoalus@localhost:5432/nostragoalus'

export const E2E_SLUG = 'e2e-cup'

let pool: Pool | null = null
function db(): Pool {
  if (!pool) pool = new Pool({ connectionString: CONNECTION })
  return pool
}

export async function closeDb(): Promise<void> {
  await pool?.end()
  pool = null
}

export interface SeededFixture {
  competitionId: string
  matchId: string
  slug: string
  home: { code: string; name: string }
  away: { code: string; name: string }
}

// A clean competition with a single GROUP match kicking off in the future, so the
// pick window is open. Drops any previous e2e competition first so re-runs start
// from a known state.
export async function seedCompetitionWithMatch(): Promise<SeededFixture> {
  await cleanup()
  const home = { code: 'ESP', name: 'Spain' }
  const away = { code: 'BRA', name: 'Brazil' }
  const kickoff = new Date(Date.now() + 6 * 60 * 60 * 1000) // +6h, well inside the pick window

  const { rows } = await db().query<{ competition_id: string; match_id: string }>(
    `
    with c as (
      insert into competition (id, slug, name, provider, external_competition_id, season_hint, is_active)
      values (gen_random_uuid(), $1, 'E2E Cup', 'fifa', 'e2e', '2026', true)
      returning id
    ),
    r as (
      insert into round (id, competition_id, kind, stage, matchday, label, sort_order)
      select gen_random_uuid(), c.id, 'GROUP_MATCHDAY', 'GROUP', 1, 'Matchday 1', 1 from c
      returning id, competition_id
    )
    insert into match (id, competition_id, provider_match_id, round_id, stage, group_name,
                       home_team, away_team, home_team_code, away_team_code, kickoff_time, status)
    select gen_random_uuid(), r.competition_id, 'e2e-m1', r.id, 'GROUP', 'A',
           $2, $3, $4, $5, $6, 'SCHEDULED'
    from r
    returning id as match_id, competition_id
    `,
    [E2E_SLUG, home.name, away.name, home.code, away.code, kickoff.toISOString()],
  )
  return { competitionId: rows[0].competition_id, matchId: rows[0].match_id, slug: E2E_SLUG, home, away }
}

// The (single) prediction stored for a match, for asserting the pick saved.
export async function getMatchPrediction(matchId: string): Promise<{ home: number; away: number } | null> {
  const { rows } = await db().query<{ home_goals: number; away_goals: number }>(
    `select home_goals, away_goals from prediction where match_id = $1 limit 1`,
    [matchId],
  )
  return rows[0] ? { home: rows[0].home_goals, away: rows[0].away_goals } : null
}

// The scored figures for a match's (single) prediction, to assert finalize ran.
export async function getPredictionScore(
  matchId: string,
): Promise<{ totalPoints: number; baseTier: string | null; lockedAt: string | null } | null> {
  const { rows } = await db().query<{ total_points: number; base_tier: string | null; locked_at: string | null }>(
    `select total_points, base_tier, locked_at from prediction where match_id = $1 limit 1`,
    [matchId],
  )
  return rows[0]
    ? { totalPoints: rows[0].total_points, baseTier: rows[0].base_tier, lockedAt: rows[0].locked_at }
    : null
}

// Flip the seeded match to a finished result with a past kickoff, so finalize
// will lock the predictions and score them.
export async function finishMatch(matchId: string, home: number, away: number): Promise<void> {
  const winner = home > away ? 'HOME' : home < away ? 'AWAY' : 'DRAW'
  // details_fetched_at is set so finalize doesn't try to provider-sync details for
  // this synthetic match (the fake competition has no real upstream, which hangs).
  await db().query(
    `update match
     set status = 'FINISHED', full_time_home = $2, full_time_away = $3, winner = $4,
         kickoff_time = now() - interval '3 hours', details_fetched_at = now()
     where id = $1`,
    [matchId, home, away, winner],
  )
}

// Mark a user's email verified, so they can sign in regardless of the instance's
// email-verification setting (used to make the admin account usable in setup).
export async function markUserVerified(email: string): Promise<void> {
  await db().query(`update "user" set email_verified = true where email = $1`, [email])
}

// Mark an SSO provider's domain verified, so sso/check routes that domain to it.
// Domain ownership verification is out of scope in this single-tenant model (the
// admin who registers a provider is trusted), so the e2e does what an admin would.
export async function verifySsoDomain(providerId: string): Promise<void> {
  await db().query(`update sso_provider set domain_verified = true where provider_id = $1`, [providerId])
}

// Remove the e2e competition and everything hanging off it. Predictions reference
// the match, so clear them first, then matches, rounds, and the competition.
export async function cleanup(): Promise<void> {
  await db().query(
    `delete from prediction where match_id in
       (select m.id from match m join competition c on c.id = m.competition_id where c.slug = $1)`,
    [E2E_SLUG],
  )
  await db().query(`delete from match where competition_id in (select id from competition where slug = $1)`, [E2E_SLUG])
  await db().query(`delete from round where competition_id in (select id from competition where slug = $1)`, [E2E_SLUG])
  await db().query(`delete from competition where slug = $1`, [E2E_SLUG])
}
