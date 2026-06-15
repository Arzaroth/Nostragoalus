// Seed test users with full WC2026 group-stage prediction sets. Two users, two
// methods, so the leaderboard can compare predictors head to head:
//
//   claude  - FIFA-points Poisson. Strength = each team's FIFA world-ranking
//             points (clean: FIFA does not republish mid-tournament). Goal
//             supremacy E=(ptsH-ptsA)/180, +0.30 host edge, expected total
//             T=2.6+0.25*min(|E|,3), then the argmax of a Poisson score matrix.
//
//   claude2 - Full model. Strength = a z-score blend of World Football Elo
//             (0.45) + FIFA points (0.30) + last-10 form (0.25), with a per-fixture
//             head-to-head nudge (last <=6 meetings, 2017-2026). Same Poisson
//             engine: E=1.1*(zBlendH-zBlendA)+host+h2h -> matrix argmax.
//
// Both use pre-tournament info only (no in-WC results). Joker per group-stage
// round = the round's highest single-scoreline probability. Best scorer is a
// player prop outside either team model (Mbappe is the modal pick for both).
// Idempotent: every listed user is deleted and recreated on each run.
// Run with the stack up: node scripts/seed-claude.mjs
import pg from 'pg'

const COMPETITION_SLUG = process.env.COMPETITION_SLUG ?? 'world-cup-2026'
// Served from public/ by Nitro (dev and prod build alike).
const USER_IMAGE = '/avatars/claude.svg'
// Modal Golden Boot bet for both models: elite finisher, France's penalty taker
// and the deepest expected run = most games. playerId is the FIFA IdPlayer (must
// match goal_event for the award), fetched from the WC26 France squad doc.
const BEST_SCORER = { playerId: '389867', playerName: 'Kylian MBAPPE', teamCode: 'FRA', teamName: 'France' }

// Predictions keyed `${homeCode}_${awayCode}` (each directed pairing is unique
// inside a World Cup group stage). [homeGoals, awayGoals, isJoker].

// claude - FIFA-points Poisson (argmax scoreline per fixture).
const PRED_FIFA = {
  MEX_RSA: [2, 0], KOR_CZE: [1, 1], CZE_RSA: [1, 1], MEX_KOR: [1, 0], CZE_MEX: [0, 1], RSA_KOR: [0, 1],
  CAN_BIH: [2, 0], QAT_SUI: [0, 1], SUI_BIH: [2, 0], CAN_QAT: [1, 0], SUI_CAN: [1, 1], BIH_QAT: [1, 1],
  BRA_MAR: [1, 1], HAI_SCO: [0, 2], SCO_MAR: [0, 2], BRA_HAI: [2, 0], MAR_HAI: [2, 0], SCO_BRA: [0, 2],
  USA_PAR: [2, 0], AUS_TUR: [1, 1], USA_AUS: [1, 0], TUR_PAR: [1, 1], PAR_AUS: [1, 1], TUR_USA: [1, 1],
  GER_CUW: [2, 0], CIV_ECU: [1, 1], GER_CIV: [1, 0], ECU_CUW: [2, 0], CUW_CIV: [0, 2], ECU_GER: [1, 1],
  NED_JPN: [1, 1], SWE_TUN: [1, 1], NED_SWE: [2, 0], TUN_JPN: [0, 1], TUN_NED: [0, 2], JPN_SWE: [1, 0],
  BEL_EGY: [1, 0], IRN_NZL: [2, 0], BEL_IRN: [1, 1], NZL_EGY: [0, 2], NZL_BEL: [0, 2], EGY_IRN: [1, 1],
  ESP_CPV: [3, 0, true], KSA_URU: [0, 2], ESP_KSA: [2, 0], URU_CPV: [2, 0], URU_ESP: [0, 2], CPV_KSA: [1, 1],
  FRA_SEN: [1, 0], IRQ_NOR: [1, 1], FRA_IRQ: [2, 0], NOR_SEN: [1, 1], NOR_FRA: [0, 2], SEN_IRQ: [2, 0],
  ARG_ALG: [2, 0], AUT_JOR: [2, 0], ARG_AUT: [2, 0], JOR_ALG: [0, 1], JOR_ARG: [0, 2, true], ALG_AUT: [1, 1],
  POR_COD: [2, 0], UZB_COL: [0, 2], POR_UZB: [2, 0], COL_COD: [2, 0], COD_UZB: [1, 1], COL_POR: [1, 1],
  ENG_CRO: [1, 1], GHA_PAN: [0, 1], ENG_GHA: [2, 0, true], PAN_CRO: [0, 1], CRO_GHA: [2, 0], PAN_ENG: [0, 2],
}

// claude2 - full model (Elo + FIFA + last-10 form + h2h, same Poisson engine).
const PRED_FULL = {
  MEX_RSA: [2, 0], KOR_CZE: [1, 1], CZE_RSA: [1, 0], MEX_KOR: [1, 0], CZE_MEX: [0, 1], RSA_KOR: [0, 2],
  CAN_BIH: [1, 0], QAT_SUI: [0, 2], SUI_BIH: [2, 0], CAN_QAT: [2, 0], SUI_CAN: [1, 1], BIH_QAT: [1, 0],
  BRA_MAR: [1, 1], HAI_SCO: [0, 2], SCO_MAR: [1, 1], BRA_HAI: [2, 0], MAR_HAI: [2, 0], SCO_BRA: [0, 2],
  USA_PAR: [1, 0], AUS_TUR: [1, 1], USA_AUS: [1, 1], TUR_PAR: [1, 0], PAR_AUS: [1, 1], TUR_USA: [1, 1],
  GER_CUW: [3, 0, true], CIV_ECU: [1, 1], GER_CIV: [2, 0], ECU_CUW: [2, 0], CUW_CIV: [0, 2], ECU_GER: [0, 1],
  NED_JPN: [1, 1], SWE_TUN: [1, 1], NED_SWE: [2, 0], TUN_JPN: [0, 2], TUN_NED: [0, 2], JPN_SWE: [2, 0],
  BEL_EGY: [2, 0], IRN_NZL: [2, 0], BEL_IRN: [2, 0], NZL_EGY: [0, 2], NZL_BEL: [0, 3, true], EGY_IRN: [1, 1],
  ESP_CPV: [3, 0], KSA_URU: [0, 2], ESP_KSA: [3, 0], URU_CPV: [2, 0], URU_ESP: [0, 2], CPV_KSA: [1, 1],
  FRA_SEN: [1, 0], IRQ_NOR: [0, 2], FRA_IRQ: [2, 0], NOR_SEN: [1, 1], NOR_FRA: [0, 1], SEN_IRQ: [2, 0],
  ARG_ALG: [2, 0], AUT_JOR: [2, 0], ARG_AUT: [2, 0], JOR_ALG: [0, 1], JOR_ARG: [0, 3], ALG_AUT: [1, 1],
  POR_COD: [2, 0], UZB_COL: [0, 2], POR_UZB: [2, 0], COL_COD: [2, 0], COD_UZB: [1, 1], COL_POR: [1, 1],
  ENG_CRO: [1, 0], GHA_PAN: [0, 2], ENG_GHA: [3, 0, true], PAN_CRO: [0, 2], CRO_GHA: [2, 0], PAN_ENG: [0, 2],
}

const USERS = [
  // FIFA #1 on the points used by this model: Argentina (1877.27), a whisker
  // above Spain (1874.71) and France (1870.70).
  { id: 'claude', name: 'claude', predictions: PRED_FIFA, champion: { code: 'ARG', name: 'Argentina' } },
  // Highest blended z (Elo+form+FIFA) is Spain, ahead of Argentina and France.
  { id: 'claude2', name: 'claude2', predictions: PRED_FULL, champion: { code: 'ESP', name: 'Spain' } },
]

const client = new pg.Client(process.env.DATABASE_URL ?? 'postgres://nostragoalus:nostragoalus@localhost:5432/nostragoalus')
await client.connect()

const { rows: comps } = await client.query(`SELECT id FROM competition WHERE slug = $1`, [COMPETITION_SLUG])
if (comps.length === 0) throw new Error(`competition not found: ${COMPETITION_SLUG}`)
const competitionId = comps[0].id

const { rows: matches } = await client.query(
  `SELECT id, round_id, home_team_code, away_team_code, kickoff_time
   FROM match
   WHERE competition_id = $1 AND stage = 'GROUP'
     AND home_team_code IS NOT NULL AND away_team_code IS NOT NULL`,
  [competitionId],
)

async function seedUser(u) {
  const email = `${u.id}@nostragoalus.test`
  // Recreate the user cleanly (cascades drop old predictions/picks).
  await client.query(`DELETE FROM "user" WHERE id = $1 OR email = $2`, [u.id, email])
  await client.query(
    `INSERT INTO "user" (id, name, email, email_verified, image, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, now(), now())`,
    [u.id, u.name, email, USER_IMAGE],
  )
  await client.query(
    `INSERT INTO user_profile (user_id, display_name, joined_at) VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO NOTHING`,
    [u.id, u.name],
  )

  const used = new Set()
  let preds = 0
  let jokers = 0
  const missing = []
  for (const m of matches) {
    const key = `${m.home_team_code}_${m.away_team_code}`
    const p = u.predictions[key]
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
      [u.id, m.id, m.round_id, h, a, joker, locked],
    )
    preds++
    if (joker) jokers++
  }

  await client.query(
    `INSERT INTO champion_pick (id, user_id, competition_id, team_code, team_name, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, now(), now())`,
    [u.id, competitionId, u.champion.code, u.champion.name],
  )
  await client.query(
    `INSERT INTO best_scorer_pick (id, user_id, competition_id, player_id, player_name, team_code, team_name, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, now(), now())`,
    [u.id, competitionId, BEST_SCORER.playerId, BEST_SCORER.playerName, BEST_SCORER.teamCode, BEST_SCORER.teamName],
  )

  const unmatched = Object.keys(u.predictions).filter((k) => !used.has(k))
  console.log(`${u.id}: ${preds} predictions (jokers: ${jokers}), champion ${u.champion.name}, best scorer ${BEST_SCORER.playerName}`)
  if (missing.length) console.warn(`  ${u.id} - DB fixtures with no prediction (${missing.length}): ${missing.join(', ')}`)
  if (unmatched.length) console.warn(`  ${u.id} - predictions not matched to a fixture (${unmatched.length}): ${unmatched.join(', ')}`)
}

console.log(`competition: ${COMPETITION_SLUG} (${competitionId})`)
for (const u of USERS) await seedUser(u)

await client.end()
