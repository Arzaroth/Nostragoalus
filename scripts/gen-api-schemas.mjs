// Samples the running API and infers JSON schemas + trimmed examples for the
// docs ("No Body" killer). Run with the dev stack up: node scripts/gen-api-schemas.mjs
import { writeFileSync } from 'node:fs'

const APP = process.env.APP_URL ?? 'http://localhost:3000'
const ADMIN = { email: 'verify@example.com', password: 'password123' }

function inferSchema(value, depth = 0) {
  if (value === null) return { type: 'string', nullable: true }
  if (Array.isArray(value)) {
    return { type: 'array', items: value.length && depth < 6 ? inferSchema(value[0], depth + 1) : {} }
  }
  switch (typeof value) {
    case 'number':
      return { type: Number.isInteger(value) ? 'integer' : 'number' }
    case 'boolean':
      return { type: 'boolean' }
    case 'object': {
      if (depth >= 6) return { type: 'object' }
      const properties = {}
      for (const [k, v] of Object.entries(value)) properties[k] = inferSchema(v, depth + 1)
      return { type: 'object', properties }
    }
    default:
      return { type: 'string' }
  }
}

// Examples stay readable: arrays cut to one element, deep objects kept.
function trimExample(value, depth = 0) {
  if (Array.isArray(value)) return value.slice(0, 1).map((v) => trimExample(v, depth + 1))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, trimExample(v, depth + 1)]))
  }
  return value
}

let cookie = ''
async function call(path) {
  const res = await fetch(`${APP}${path}`, { headers: { cookie } })
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

// sign in for the authenticated endpoints
const signIn = await fetch(`${APP}/api/auth/sign-in/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', Origin: APP },
  body: JSON.stringify(ADMIN),
})
cookie = (signIn.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')

const comp = 'world-cup-2022' // finished matches: results, stats, brackets
const liveComp = 'world-cup-2026' // where the seeded account actually predicts
const matches = await call(`/api/matches?competition=${comp}`)
const sampleMatch = (matches.matches ?? matches).find?.((m) => m.status === 'FINISHED') ?? null
const matchId = sampleMatch?.id
const session = await call('/api/auth/get-session')
const userId = session?.user?.id

// docs path -> live sample path
const TARGETS = {
  '/api/competitions': '/api/competitions',
  '/api/matches': `/api/matches?competition=${comp}`,
  '/api/matches/{id}': `/api/matches/${matchId}`,
  '/api/matches/{id}/insights': `/api/matches/${matchId}/insights`,
  '/api/matches/{id}/live-detail': `/api/matches/${matchId}/live-detail`,
  '/api/leaderboard': `/api/leaderboard?competition=${comp}`,
  '/api/competitions/scorers': `/api/competitions/scorers?competition=${comp}`,
  '/api/competitions/teams': `/api/competitions/teams?competition=${comp}`,
  '/api/competitions/bracket': `/api/competitions/bracket?competition=${comp}`,
  '/api/teams/{code}': `/api/teams/FRA?competition=${comp}`,
  '/api/predictions': `/api/predictions?competition=${liveComp}`,
  '/api/champion': `/api/champion?competition=${liveComp}`,
  '/api/me/stats': `/api/me/stats?competition=${liveComp}`,
  '/api/me/trust-status': '/api/me/trust-status',
  '/api/predictions/crowd': `/api/predictions/crowd?competition=${liveComp}`,
  '/api/users/{id}/predictions': `/api/users/${userId}/predictions?competition=${liveComp}`,
}

const out = {}
for (const [docPath, livePath] of Object.entries(TARGETS)) {
  try {
    const data = await call(livePath)
    out[docPath] = { schema: inferSchema(data), example: trimExample(data) }
    console.log('ok ', docPath)
  } catch (e) {
    console.log('SKIP', docPath, String(e.message ?? e))
  }
}
writeFileSync('server/utils/docs/response-schemas.json', JSON.stringify(out, null, 2) + '\n')
console.log(`wrote ${Object.keys(out).length} schemas`)
