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

// finalize/scoring needs an active default scoring_config, but a freshly-migrated
// e2e DB has none (it is normally seeded by the fixtures import, which the
// isolated stack never runs). Seed a minimal one - base points only, no crowd or
// odds bonus - so matches:finalize can score the predict spec's pick. Idempotent.
export async function seedDefaultScoringConfig(): Promise<void> {
  await db().query(`
    insert into scoring_config (id, version, is_active, competition_id, bonus_source, crowd_tiers)
    select gen_random_uuid(), 1, true, null, 'NONE', '[]'::jsonb
    where not exists (select 1 from scoring_config where competition_id is null and is_active = true)
  `)
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

// Seed a crowd of synthetic users each predicting the match, so the bots have a
// consensus to derive from (MODE needs >= 5 distinct predictors). Emails share
// the `bot-crowd-` prefix that cleanup() sweeps. Predictions are inserted
// unlocked/unscored - finalize (or the future kickoff) settles them.
export async function seedCrowdPredictions(matchId: string, picks: [number, number][]): Promise<void> {
  const { rows } = await db().query<{ round_id: string }>(`select round_id from match where id = $1`, [matchId])
  const roundId = rows[0].round_id
  for (let i = 0; i < picks.length; i += 1) {
    const id = `bot-crowd-${i}`
    await db().query(
      `insert into "user" (id, name, email, email_verified, updated_at)
       values ($1, $2, $3, true, now()) on conflict (id) do nothing`,
      [id, `Crowd ${i}`, `${id}@e2e.local`],
    )
    await db().query(
      `insert into prediction (id, user_id, match_id, round_id, home_goals, away_goals, updated_at)
       values (gen_random_uuid(), $1, $2, $3, $4, $5, now())`,
      [id, matchId, roundId, picks[i][0], picks[i][1]],
    )
  }
}

// Seed one prediction for a specific (already-existing) user - e.g. the
// signed-up viewer whose evil twin swaps their own pick.
export async function seedUserPrediction(
  userId: string,
  matchId: string,
  home: number,
  away: number,
  isJoker = false,
): Promise<void> {
  const { rows } = await db().query<{ round_id: string }>(`select round_id from match where id = $1`, [matchId])
  await db().query(
    `insert into prediction (id, user_id, match_id, round_id, home_goals, away_goals, is_joker, updated_at)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, now())`,
    [userId, matchId, rows[0].round_id, home, away, isJoker],
  )
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

// A user's id + ban state, for asserting SCIM deprovisioning (active:false -> ban).
export async function getUserByEmail(email: string): Promise<{ id: string; banned: boolean } | null> {
  const { rows } = await db().query<{ id: string; banned: boolean | null }>(
    `select id, banned from "user" where email = $1 limit 1`,
    [email],
  )
  return rows[0] ? { id: rows[0].id, banned: rows[0].banned ?? false } : null
}

// Remove a SCIM-provisioned test user (and its accounts) so re-runs start clean.
export async function deleteUserByEmail(email: string): Promise<void> {
  await db().query(`delete from "user" where email = $1`, [email])
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
  // competition_award / user_achievement / showcase_pin all cascade off this delete.
  await db().query(`delete from competition where slug = $1`, [E2E_SLUG])
  // Synthetic crowd users seeded for the bot spec (their predictions are gone
  // with the match above, so the FK is clear).
  await db().query(`delete from "user" where email like 'bot-crowd-%@e2e.local'`)
}

// The signed-up user's id, so award/achievement/showcase rows can be seeded for
// them (signUp/freshUser don't expose the created id).
export async function getUserIdByEmail(email: string): Promise<string> {
  const { rows } = await db().query<{ id: string }>(`select id from "user" where email = $1 limit 1`, [email])
  return rows[0].id
}

// Seed a competition-end trophy for a user (default: the overall winner).
export async function seedTrophy(competitionId: string, userId: string, type = 'OVERALL', value = 42): Promise<void> {
  await db().query(
    `insert into competition_award (id, competition_id, user_id, type, value)
     values (gen_random_uuid(), $1, $2, $3, $4)`,
    [competitionId, userId, type, value],
  )
}

// Seed an earned achievement badge for a user in a competition.
export async function seedAchievement(
  userId: string,
  competitionId: string,
  key: string,
  tier = 'BRONZE',
): Promise<void> {
  await db().query(
    `insert into user_achievement (id, user_id, competition_id, key, tier, progress)
     values (gen_random_uuid(), $1, $2, $3, $4, 1)`,
    [userId, competitionId, key, tier],
  )
}

// The user's saved showcase pins (ordered), to assert the arrange-and-save flow.
export async function getShowcasePins(
  userId: string,
  competitionId: string,
): Promise<{ achievementKey: string }[]> {
  const { rows } = await db().query<{ achievement_key: string }>(
    `select achievement_key from showcase_pin where user_id = $1 and competition_id = $2 order by slot`,
    [userId, competitionId],
  )
  return rows.map((r) => ({ achievementKey: r.achievement_key }))
}

// A private league owned by the given user (cascades off the e2e competition on
// cleanup), for the rewards flow.
export async function seedLeague(competitionId: string, ownerId: string): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    `with l as (
       insert into league (id, competition_id, name, visibility, join_code, created_by)
       values (gen_random_uuid(), $1, 'E2E League', 'PRIVATE', 'E2E' || substr(md5(random()::text), 1, 8), $2)
       returning id
     )
     insert into league_member (league_id, user_id, role) select id, $2, 'OWNER' from l
     returning league_id as id`,
    [competitionId, ownerId],
  )
  return rows[0].id
}

// A scored prediction for a user on a match, so they lead the leaderboard.
export async function seedScoredPrediction(
  userId: string,
  matchId: string,
  home: number,
  away: number,
  points: number,
  tier: string,
): Promise<void> {
  await db().query(
    `insert into prediction
       (id, user_id, match_id, round_id, home_goals, away_goals, locked_at, base_tier, total_points, base_points, scored_at, scored_at_version)
     select gen_random_uuid(), $1, m.id, m.round_id, $3, $4, now(), $6, $5, $5, now(), 1 from match m where m.id = $2`,
    [userId, matchId, home, away, points, tier],
  )
}

// A decided FINAL (FINISHED with a HOME winner, scored) - the gate that unlocks
// Tournament Wrapped and the competition trophies.
export async function seedDecidedFinal(competitionId: string): Promise<void> {
  await db().query(
    `
    with r as (
      insert into round (id, competition_id, kind, stage, matchday, label, sort_order)
      values (gen_random_uuid(), $1, 'KNOCKOUT', 'FINAL', null, 'Final', 99)
      returning id, competition_id
    )
    insert into match (id, competition_id, provider_match_id, round_id, stage,
                       home_team, away_team, home_team_code, away_team_code, kickoff_time,
                       status, full_time_home, full_time_away, winner, scoring_state, details_fetched_at)
    select gen_random_uuid(), r.competition_id, 'e2e-final', r.id, 'FINAL',
           'Finalist A', 'Finalist B', 'FNA', 'FNB', now() - interval '3 hours',
           'FINISHED', 1, 0, 'HOME', 'SCORED', now()
    from r
    `,
    [competitionId],
  )
}

// A settled, scored prediction for a user on a match: flips the match to a
// finished 1-0 (scored) and stores an EXACT pick worth the given points, so the
// wrapped recap has real data without running finalize.
export async function seedFinishedExactPrediction(userId: string, matchId: string, points = 3): Promise<void> {
  await db().query(
    `update match
     set status = 'FINISHED', full_time_home = 1, full_time_away = 0, winner = 'HOME',
         kickoff_time = now() - interval '4 hours', scoring_state = 'SCORED', details_fetched_at = now()
     where id = $1`,
    [matchId],
  )
  await db().query(
    `insert into prediction (id, user_id, match_id, round_id, home_goals, away_goals,
                             locked_at, base_points, base_tier, bonus_points, total_points, scored_at)
     select gen_random_uuid(), $2, m.id, m.round_id, 1, 0,
            m.kickoff_time, $3, 'EXACT', 0, $3, now()
     from match m where m.id = $1`,
    [matchId, userId, points],
  )
}
