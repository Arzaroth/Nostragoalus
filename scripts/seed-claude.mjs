// Seed a single test user "claude" with a full set of WC2026 group-stage
// predictions. Unlike seed-demo (random crowd), these are model-derived.
//
// Method (pre-tournament info only - no in-tournament results):
//   - Strength = each team's FIFA world-ranking points (clean by construction:
//     FIFA does not republish the ranking mid-tournament), pulled from the same
//     inside.fifa.com feed the app uses.
//   - Goal supremacy E = (ptsHome - ptsAway) / 180, +0.30 for a host (MEX/USA/
//     CAN) at home. Expected total T = 2.6 + 0.25*min(|E|,3).
//   - lambdaHome/Away = (T +/- E)/2, then a Poisson score matrix (0..8); the
//     predicted score is the matrix argmax (the single most probable scoreline,
//     which for a clear favourite is usually 2-0/1-0, for a level tie 1-1).
//   - Joker per group-stage round = the round's highest single-scoreline prob.
// Idempotent: the claude user is deleted and recreated on every run.
// Run with the stack up: node scripts/seed-claude.mjs
import pg from 'pg'

const COMPETITION_SLUG = process.env.COMPETITION_SLUG ?? 'world-cup-2026'
const USER_ID = 'claude'
const USER_NAME = 'claude'
const USER_EMAIL = 'claude@nostragoalus.test'
// Served from public/ by Nitro (dev and prod build alike).
const USER_IMAGE = '/avatars/claude.svg'
// Highest-rated team on the same pre-WC FIFA points used by the model: Argentina
// (1877.27), a whisker above Spain (1874.71) and France (1870.70).
const CHAMPION = { code: 'ARG', name: 'Argentina' }
// Modal Golden Boot bet: elite finisher, France's penalty taker and the deepest
// run = most games. playerId is the FIFA IdPlayer (must match goal_event for the
// award), fetched from the WC26 France squad doc.
const BEST_SCORER = { playerId: '389867', playerName: 'Kylian MBAPPE', teamCode: 'FRA', teamName: 'France' }

// Keyed by `${homeCode}_${awayCode}` (each directed pairing is unique inside a
// World Cup group stage). [homeGoals, awayGoals, isJoker]. Values are the
// Poisson matrix argmax per fixture (see header); one joker per group-stage
// round (MD1/MD2/MD3) on the round's highest single-scoreline probability.
const PREDICTIONS = {
  // Group A
  MEX_RSA: [2, 0], KOR_CZE: [1, 1], CZE_RSA: [1, 1],
  MEX_KOR: [1, 0], CZE_MEX: [0, 1], RSA_KOR: [0, 1],
  // Group B
  CAN_BIH: [2, 0], QAT_SUI: [0, 1], SUI_BIH: [2, 0],
  CAN_QAT: [1, 0], SUI_CAN: [1, 1], BIH_QAT: [1, 1],
  // Group C - Brazil and Morocco near-level on FIFA points (1765 vs 1755)
  BRA_MAR: [1, 1], HAI_SCO: [0, 2], SCO_MAR: [0, 2],
  BRA_HAI: [2, 0], MAR_HAI: [2, 0], SCO_BRA: [0, 2],
  // Group D
  USA_PAR: [2, 0], AUS_TUR: [1, 1], USA_AUS: [1, 0],
  TUR_PAR: [1, 1], PAR_AUS: [1, 1], TUR_USA: [1, 1],
  // Group E
  GER_CUW: [2, 0], CIV_ECU: [1, 1], GER_CIV: [1, 0],
  ECU_CUW: [2, 0], CUW_CIV: [0, 2], ECU_GER: [1, 1],
  // Group F
  NED_JPN: [1, 1], SWE_TUN: [1, 1], NED_SWE: [2, 0],
  TUN_JPN: [0, 1], TUN_NED: [0, 2], JPN_SWE: [1, 0],
  // Group G
  BEL_EGY: [1, 0], IRN_NZL: [2, 0], BEL_IRN: [1, 1],
  NZL_EGY: [0, 2], NZL_BEL: [0, 2], EGY_IRN: [1, 1],
  // Group H
  ESP_CPV: [3, 0, true], KSA_URU: [0, 2], ESP_KSA: [2, 0],
  URU_CPV: [2, 0], URU_ESP: [0, 2], CPV_KSA: [1, 1],
  // Group I
  FRA_SEN: [1, 0], IRQ_NOR: [1, 1], FRA_IRQ: [2, 0],
  NOR_SEN: [1, 1], NOR_FRA: [0, 2], SEN_IRQ: [2, 0],
  // Group J
  ARG_ALG: [2, 0], AUT_JOR: [2, 0], ARG_AUT: [2, 0],
  JOR_ALG: [0, 1], JOR_ARG: [0, 2, true], ALG_AUT: [1, 1],
  // Group K
  POR_COD: [2, 0], UZB_COL: [0, 2], POR_UZB: [2, 0],
  COL_COD: [2, 0], COD_UZB: [1, 1], COL_POR: [1, 1],
  // Group L - Panama out-ranks Ghana on FIFA points (1539 vs 1347)
  ENG_CRO: [1, 1], GHA_PAN: [0, 1], ENG_GHA: [2, 0, true],
  PAN_CRO: [0, 1], CRO_GHA: [2, 0], PAN_ENG: [0, 2],
}

const client = new pg.Client(process.env.DATABASE_URL ?? 'postgres://nostragoalus:nostragoalus@localhost:5432/nostragoalus')
await client.connect()

const { rows: comps } = await client.query(`SELECT id FROM competition WHERE slug = $1`, [COMPETITION_SLUG])
if (comps.length === 0) throw new Error(`competition not found: ${COMPETITION_SLUG}`)
const competitionId = comps[0].id

// Recreate the user cleanly (cascades drop old predictions/picks).
await client.query(`DELETE FROM "user" WHERE id = $1 OR email = $2`, [USER_ID, USER_EMAIL])
await client.query(
  `INSERT INTO "user" (id, name, email, email_verified, image, created_at, updated_at)
   VALUES ($1, $2, $3, true, $4, now(), now())`,
  [USER_ID, USER_NAME, USER_EMAIL, USER_IMAGE],
)
await client.query(
  `INSERT INTO user_profile (user_id, display_name, joined_at) VALUES ($1, $2, now())
   ON CONFLICT (user_id) DO NOTHING`,
  [USER_ID, USER_NAME],
)

const { rows: matches } = await client.query(
  `SELECT id, round_id, home_team_code, away_team_code, kickoff_time
   FROM match
   WHERE competition_id = $1 AND stage = 'GROUP'
     AND home_team_code IS NOT NULL AND away_team_code IS NOT NULL`,
  [competitionId],
)

const used = new Set()
let preds = 0
let jokers = 0
const missing = []
for (const m of matches) {
  const key = `${m.home_team_code}_${m.away_team_code}`
  const p = PREDICTIONS[key]
  if (!p) {
    missing.push(key)
    continue
  }
  used.add(key)
  const [h, a, joker = false] = p
  // Stamp locked_at on fixtures whose kickoff has already passed, so the picks
  // read as legitimate pre-kickoff locks rather than late edits.
  const locked = new Date(m.kickoff_time) < new Date() ? m.kickoff_time : null
  await client.query(
    `INSERT INTO prediction (id, user_id, match_id, round_id, home_goals, away_goals, is_joker, locked_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, now(), now())`,
    [USER_ID, m.id, m.round_id, h, a, joker, locked],
  )
  preds++
  if (joker) jokers++
}

await client.query(
  `INSERT INTO champion_pick (id, user_id, competition_id, team_code, team_name, created_at, updated_at)
   VALUES (gen_random_uuid(), $1, $2, $3, $4, now(), now())`,
  [USER_ID, competitionId, CHAMPION.code, CHAMPION.name],
)

await client.query(
  `INSERT INTO best_scorer_pick (id, user_id, competition_id, player_id, player_name, team_code, team_name, created_at, updated_at)
   VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, now(), now())`,
  [USER_ID, competitionId, BEST_SCORER.playerId, BEST_SCORER.playerName, BEST_SCORER.teamCode, BEST_SCORER.teamName],
)

const unmatched = Object.keys(PREDICTIONS).filter((k) => !used.has(k))
console.log(`competition: ${COMPETITION_SLUG} (${competitionId})`)
console.log(`predictions inserted: ${preds} (jokers: ${jokers}), champion: ${CHAMPION.name}, best scorer: ${BEST_SCORER.playerName}`)
if (missing.length) console.warn(`DB fixtures with no prediction (${missing.length}): ${missing.join(', ')}`)
if (unmatched.length) console.warn(`predictions not matched to a fixture (${unmatched.length}): ${unmatched.join(', ')}`)

await client.end()
