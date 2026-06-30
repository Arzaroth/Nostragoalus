import type { FullConfig } from '@playwright/test'
import { closeDb, markUserVerified } from './helpers/db'

// Make the suite reproducible from an empty, freshly-migrated DB: wait for the
// app, then ensure the admin account exists (the specs need it for finalize and
// SSO registration; nothing else creates it). Its email is in NUXT_ADMIN_EMAILS,
// so once it exists it is an admin.
const APP = process.env.E2E_APP_URL ?? 'http://localhost:3000'
const ADMIN = {
  name: 'E2E Admin',
  email: process.env.E2E_ADMIN_EMAIL ?? 'verify@example.com',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'password123',
}

async function signInToken(): Promise<string | undefined> {
  const r = await fetch(`${APP}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Origin: APP },
    body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password }),
  }).catch(() => null)
  if (!r) return undefined
  return ((await r.json().catch(() => ({}))) as { token?: string }).token
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  // Wait for the app to serve.
  for (let i = 0; ; i++) {
    const r = await fetch(`${APP}/login`, { redirect: 'manual' }).catch(() => null)
    if (r && r.status > 0 && r.status < 500) break
    if (i >= 180) throw new Error(`app at ${APP} not ready`)
    await new Promise((s) => setTimeout(s, 1000))
  }

  if (await signInToken()) return // admin already exists and can sign in

  // Create it (sign-up of an existing email is a synthetic no-op), then flip it to
  // verified directly in the DB so it can sign in whatever the instance's
  // email-verification setting is - this is setup, not a flow under test.
  await fetch(`${APP}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Origin: APP },
    body: JSON.stringify({ name: ADMIN.name, email: ADMIN.email, password: ADMIN.password }),
  })
  await markUserVerified(ADMIN.email)
  await closeDb()
  if (!(await signInToken())) throw new Error('admin account not usable after signup')
}
