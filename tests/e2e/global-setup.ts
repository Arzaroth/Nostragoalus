import type { FullConfig } from '@playwright/test'
import { request } from '@playwright/test'
import { closeDb, markUserVerified, seedDefaultScoringConfig } from './helpers/db'

// Make the suite reproducible from an empty, freshly-migrated DB: wait for the
// app, ensure the admin account exists (the specs need it for finalize and SSO
// registration; nothing else creates it), then turn ON signup email verification
// so the spec signUp helper's mail-confirm path is the deterministic one. A fresh
// DB defaults verification OFF, which signs new users in directly and races the
// helper's redirect detection; the toggle is flipped in-process via the admin API
// so the app's cached flag updates immediately (existing accounts are
// grandfathered verified, so the admin stays usable).
const APP = process.env.E2E_APP_URL ?? 'http://localhost:3000'
const ADMIN = {
  name: 'E2E Admin',
  email: process.env.E2E_ADMIN_EMAIL ?? 'verify@example.com',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'password123',
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const api = await request.newContext({ baseURL: APP })

  // Wait for the app to serve.
  for (let i = 0; ; i++) {
    const r = await api.get('/login', { failOnStatusCode: false, maxRedirects: 0 }).catch(() => null)
    if (r && r.status() > 0 && r.status() < 500) break
    if (i >= 180) throw new Error(`app at ${APP} not ready`)
    await new Promise((s) => setTimeout(s, 1000))
  }

  // Warm the SSR compile of the pages the first specs drive: under the HMR dev
  // server a route compiles on first hit, and a cold /signup can compile slower
  // than the form interaction, so the very first signup would otherwise drop its
  // account. A plain GET triggers the server-side compile.
  for (const path of ['/signup', '/login', '/forgot-password', '/verify-email']) {
    await api.get(path, { failOnStatusCode: false, maxRedirects: 0 }).catch(() => {})
  }

  const signIn = () =>
    api.post('/api/auth/sign-in/email', {
      headers: { Origin: APP },
      data: { email: ADMIN.email, password: ADMIN.password },
      failOnStatusCode: false,
    })

  // Create the admin if it can't sign in yet (sign-up of an existing email is a
  // synthetic no-op), then flip it to verified directly in the DB so it can sign
  // in whatever the instance's email-verification setting is - this is setup, not
  // a flow under test. The request context keeps the session cookie for the
  // admin-only call below.
  if (!(await signIn()).ok()) {
    await api.post('/api/auth/sign-up/email', {
      headers: { Origin: APP },
      data: { name: ADMIN.name, email: ADMIN.email, password: ADMIN.password },
      failOnStatusCode: false,
    })
    await markUserVerified(ADMIN.email)
    await closeDb()
    if (!(await signIn()).ok()) throw new Error('admin account not usable after signup')
  }

  // Require email verification for new sign-ups (idempotent). SMTP is wired to
  // maildev, so a signup now mails the confirm link the signUp helper drives.
  const res = await api.post('/api/admin/settings/email-verification', {
    headers: { Origin: APP },
    data: { enabled: true },
    failOnStatusCode: false,
  })
  if (!res.ok()) throw new Error(`enable email verification failed: ${res.status()} ${await res.text()}`)
  await api.dispose()

  // The isolated DB never runs the fixtures import, so seed the default scoring
  // config finalize needs.
  await seedDefaultScoringConfig()
  await closeDb()
}
