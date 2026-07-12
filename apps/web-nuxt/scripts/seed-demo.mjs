// Fill the database with a lively crowd of demo players: predictions across
// all competitions (biased toward real results so the leaderboard looks
// plausible), jokers, champion picks. Idempotent-ish: demo users are recreated.
// Run with the stack up: node scripts/seed-demo.mjs
import pg from 'pg'

const client = new pg.Client(process.env.DATABASE_URL ?? 'postgres://nostragoalus:nostragoalus@localhost:5432/nostragoalus')
await client.connect()

const NAMES = [
  'Pelé du Futur', 'Madame Irma', 'Paul le Poulpe', 'Cassandra FC', 'Nostradamus Jr',
  'The Gaffer', 'Tiki Taka Tess', 'Catenaccio Carl', 'Gegenpress Greta', 'Park the Bus Bob',
  'La Pythie', 'Oracle of Anfield', 'Septième Sens', 'Volley Voyante', 'Corner Casper',
  'Xavi des Étoiles', 'Boule de Cristal', 'Lucky Luka', 'Madame Soleil', 'Le Sorcier Blanc',
  'Astro Turf', 'Mystic Mbappé', 'Tarot Totti', 'Zlatan le Devin',
]

// deterministic-ish RNG so reruns look similar
let seed = 42
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]

await client.query(`DELETE FROM "user" WHERE email LIKE 'demo-%@nostragoalus.test'`)

const userIds = []
for (let i = 0; i < NAMES.length; i++) {
  const id = `demo-${i}-${NAMES[i].toLowerCase().replace(/[^a-z]+/g, '')}`
  const avatar = `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${encodeURIComponent(NAMES[i])}`
  await client.query(
    `INSERT INTO "user" (id, name, email, email_verified, image, created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, now() - interval '30 days', now())`,
    [id, NAMES[i], `demo-${i}@nostragoalus.test`, avatar],
  )
  await client.query(
    `INSERT INTO user_profile (user_id, display_name, joined_at) VALUES ($1, $2, now() - interval '30 days')
     ON CONFLICT (user_id) DO NOTHING`,
    [id, NAMES[i]],
  )
  userIds.push(id)
}
console.log(`users: ${userIds.length}`)

const { rows: matches } = await client.query(
  `SELECT m.id, m.round_id, m.competition_id, m.status, m.full_time_home, m.full_time_away, m.kickoff_time,
          m.home_team_code, m.away_team_code, c.slug
   FROM match m JOIN competition c ON c.id = m.competition_id
   WHERE m.home_team_code IS NOT NULL AND m.away_team_code IS NOT NULL`,
)

// a plausible prediction: often near the real result, sometimes bold
function predictFor(m) {
  if (m.status === 'FINISHED' && m.full_time_home != null) {
    const roll = rnd()
    if (roll < 0.18) return [m.full_time_home, m.full_time_away] // exact
    if (roll < 0.45) return [Math.max(0, m.full_time_home + (rnd() < 0.5 ? 1 : -1)), m.full_time_away] // close
    return [Math.floor(rnd() * 4), Math.floor(rnd() * 3)]
  }
  return [Math.floor(rnd() * 4), Math.floor(rnd() * 3)]
}

let preds = 0
for (const u of userIds) {
  // each player covers most, not all, matches - gaps look human
  for (const m of matches) {
    if (rnd() < 0.18) continue
    const [h, a] = predictFor(m)
    const locked = new Date(m.kickoff_time) < new Date() ? m.kickoff_time : null
    await client.query(
      `INSERT INTO prediction (id, user_id, match_id, round_id, home_goals, away_goals, is_joker, locked_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, false, $6, now(), now())
       ON CONFLICT DO NOTHING`,
      [u, m.id, m.round_id, h, a, locked],
    )
    preds++
  }
}
console.log(`predictions: ${preds}`)

// one joker per round per user (on a random predicted match of that round)
await client.query(`
  UPDATE prediction p SET is_joker = true
  FROM (
    SELECT DISTINCT ON (user_id, round_id) id
    FROM prediction
    WHERE user_id LIKE 'demo-%'
    ORDER BY user_id, round_id, md5(id)
  ) j
  WHERE p.id = j.id`)

// champion picks: favorites-heavy
const FAVS = ['FRA', 'BRA', 'ESP', 'ENG', 'ARG', 'GER', 'POR', 'NED']
const { rows: comps } = await client.query(`SELECT id, slug FROM competition`)
for (const u of userIds) {
  for (const c of comps) {
    if (rnd() < 0.3) continue
    const code = pick(FAVS)
    await client.query(
      `INSERT INTO champion_pick (id, user_id, competition_id, team_code, team_name, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, now(), now()) ON CONFLICT DO NOTHING`,
      [u, c.id, code, code],
    )
  }
}

// force re-scoring of finished matches so the demo predictions earn points
await client.query(`UPDATE match SET scoring_state = 'STALE' WHERE status = 'FINISHED'`)
console.log('finished matches marked STALE - run the finalize task to score')
await client.end()
