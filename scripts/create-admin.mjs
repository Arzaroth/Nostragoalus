// Create (or promote) an admin on demand. Reuses better-auth's own signup
// (scrypt hashing, HIBP breach check, account row) against the running app,
// then sets role=admin in the DB so it doesn't rely on NUXT_ADMIN_EMAILS.
//
//   mise run create-admin <email> <password> [name]
// or: node scripts/create-admin.mjs <email> <password> [name]
//
// Idempotent: if the account already exists, it's just promoted.
import pg from 'pg'

const [email, password, ...nameParts] = process.argv.slice(2)
const name = nameParts.join(' ') || (email ? email.split('@')[0] : '')
const APP = process.env.APP_URL ?? 'http://localhost:3000'
const DB = process.env.DATABASE_URL ?? 'postgres://nostragoalus:nostragoalus@localhost:5432/nostragoalus'

if (!email || !password) {
  console.error('usage: node scripts/create-admin.mjs <email> <password> [name]')
  process.exit(1)
}

// 1. Sign up through better-auth (hashing + HIBP happen here). A duplicate is fine.
const res = await fetch(`${APP}/api/auth/sign-up/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', Origin: APP },
  body: JSON.stringify({ name, email, password }),
})
if (res.ok) {
  console.log(`signed up ${email}`)
} else {
  const msg = await res.text()
  const exists = /exist|already/i.test(msg)
  if (!exists) {
    // e.g. HIBP rejected the password, or the app is unreachable
    console.error(`sign-up failed (${res.status}): ${msg.slice(0, 200)}`)
    console.error('(a breached password is rejected by HIBP - choose a stronger one)')
    process.exit(1)
  }
  console.log(`${email} already exists - promoting`)
}

// 2. Promote to admin in the DB.
const client = new pg.Client(DB)
await client.connect()
const { rowCount } = await client.query(`UPDATE "user" SET role = 'admin' WHERE lower(email) = lower($1)`, [email])
await client.end()

if (rowCount === 0) {
  console.error(`no user row for ${email} - sign-up did not create one; nothing promoted`)
  process.exit(1)
}
console.log(`${email} is now an admin`)
