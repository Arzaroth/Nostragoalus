#!/usr/bin/env node
// E2E: the email-OTP second factor through the real stack (app + maildev).
// Requires the dev stack: mise run dev (or preview). Run: pnpm e2e:smtp
import { createHmac } from 'node:crypto'
import assert from 'node:assert/strict'

const APP = process.env.E2E_APP_URL ?? 'http://localhost:3000'
const MAILDEV = process.env.E2E_MAILDEV_URL ?? 'http://localhost:1080'
const ORIGIN = { Origin: APP, 'content-type': 'application/json' }
const EMAIL = `e2e-smtp-${Date.now()}@example.com`
const PASSWORD = 'xQ7#kP3mN9wL5vRz2'

function totp(base32) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = base32.toUpperCase().replace(/=+$/, '')
  let bits = 0
  let value = 0
  const bytes = []
  for (const ch of clean) {
    value = (value << 5) | alphabet.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)))
  const h = createHmac('sha1', Buffer.from(bytes)).update(buf).digest()
  const o = h[h.length - 1] & 0xf
  return ((h.readUInt32BE(o) & 0x7fffffff) % 1e6).toString().padStart(6, '0')
}

// minimal cookie jar
let jar = {}
async function call(path, opts = {}) {
  const res = await fetch(`${APP}${path}`, {
    ...opts,
    headers: { ...ORIGIN, ...(opts.headers ?? {}), cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') },
  })
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(';')
    const idx = pair.indexOf('=')
    const v = pair.slice(idx + 1)
    if (v) jar[pair.slice(0, idx)] = v
    else delete jar[pair.slice(0, idx)]
  }
  return res
}

console.log('1. sign up a throwaway user')
assert.equal((await call('/api/auth/sign-up/email', { method: 'POST', body: JSON.stringify({ name: 'E2E SMTP', email: EMAIL, password: PASSWORD }) })).status, 200)

console.log('2. enroll TOTP 2FA')
const enable = await (await call('/api/auth/two-factor/enable', { method: 'POST', body: JSON.stringify({ password: PASSWORD }) })).json()
const secret = new URL(enable.totpURI).searchParams.get('secret')
assert.ok(secret, 'totp secret present')
assert.equal((await call('/api/auth/two-factor/verify-totp', { method: 'POST', body: JSON.stringify({ code: totp(secret) }) })).status, 200)

console.log('3. fresh sign-in requires the second factor')
jar = {}
const signin = await (await call('/api/auth/sign-in/email', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })).json()
assert.equal(signin.twoFactorRedirect, true)

console.log('4. request an email code and pull it from maildev')
assert.equal((await call('/api/auth/two-factor/send-otp', { method: 'POST', body: '{}' })).status, 200)
await new Promise((r) => setTimeout(r, 1500))
const mails = await (await fetch(`${MAILDEV}/email`)).json()
const mail = mails.filter((m) => m.to?.[0]?.address === EMAIL).at(-1)
assert.ok(mail, 'OTP email delivered to maildev')
const otp = /code is: (\d+)/.exec(mail.text)?.[1]
assert.ok(otp, 'OTP found in the email body')

console.log(`5. verify the emailed code (${otp}) completes the sign-in`)
assert.equal((await call('/api/auth/two-factor/verify-otp', { method: 'POST', body: JSON.stringify({ code: otp }) })).status, 200)
const session = await (await call('/api/auth/get-session')).json()
assert.equal(session?.user?.email, EMAIL)

console.log('6. cleanup: delete the throwaway user (needs the fresh TOTP gate)')
assert.equal(
  (await call('/api/auth/delete-user', { method: 'POST', headers: { 'x-totp-code': totp(secret) }, body: JSON.stringify({ password: PASSWORD }) })).status,
  200,
)

console.log('\nEMAIL-OTP E2E: ALL GREEN')
