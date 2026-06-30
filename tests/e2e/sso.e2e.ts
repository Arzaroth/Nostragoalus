import { test, expect, request, type APIRequestContext } from '@playwright/test'
import { ADMIN, typeInto } from './helpers/auth'
import { closeDb, verifySsoDomain } from './helpers/db'

const APP = process.env.E2E_APP_URL ?? 'http://localhost:3000'
const PROVIDER_ID = 'keycloak-e2e'
const SSO_DOMAIN = 'e2e-sso.test'
// The app reaches Keycloak by its compose service name; the browser resolves the
// same host to the published port via the host-resolver rule in the config.
const KC_ISSUER = process.env.E2E_KC_ISSUER ?? 'http://keycloak:8080/realms/nostragoalus-e2e'
const SSO_USER = { username: 'ssouser', email: 'ssouser@e2e-sso.test', password: 'ssoPassword123' }

async function adminContext(): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: APP })
  const r = await ctx.post('/api/auth/sign-in/email', {
    headers: { Origin: APP },
    data: { email: ADMIN.email, password: ADMIN.password },
  })
  if (!r.ok()) throw new Error(`admin sign-in failed: ${r.status()}`)
  return ctx
}

// Opt-in: needs Keycloak up (compose --profile e2e) and the app started with
// NUXT_SSO_TRUSTED_ORIGINS=http://keycloak:8080 (so its SSO SSRF guard trusts the
// internal IdP). The other e2e specs run against the plain dev stack.
const SSO_ENABLED = !!process.env.E2E_SSO

test.beforeAll(async () => {
  if (!SSO_ENABLED) return
  const admin = await adminContext()
  // Idempotent: drop any prior registration, then register Keycloak as OIDC.
  await admin.delete(`/api/admin/sso/${PROVIDER_ID}`).catch(() => {})
  const res = await admin.post('/api/admin/sso', {
    data: {
      providerId: PROVIDER_ID,
      type: 'oidc',
      issuer: KC_ISSUER,
      clientId: 'nostragoalus-app',
      clientSecret: 'e2e-keycloak-secret',
      domains: SSO_DOMAIN,
      name: 'Keycloak E2E',
    },
  })
  if (!res.ok()) throw new Error(`register sso provider failed: ${res.status()} ${await res.text()}`)
  await admin.dispose()
  // sso/check only routes a *verified* domain to its provider.
  await verifySsoDomain(PROVIDER_ID)
})

test.afterAll(async () => {
  if (!SSO_ENABLED) return
  const admin = await adminContext()
  await admin.delete(`/api/admin/sso/${PROVIDER_ID}`).catch(() => {})
  await admin.dispose()
  await closeDb()
})

// A user on the captured domain is routed to Keycloak by email, authenticates
// there, and lands back in the app with a session.
test('OIDC SSO login via Keycloak', async ({ page }) => {
  test.skip(!SSO_ENABLED, 'set E2E_SSO=1, bring up Keycloak (--profile e2e), and run the app with NUXT_SSO_TRUSTED_ORIGINS=http://keycloak:8080')
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await typeInto(page.locator('input[type="email"]'), SSO_USER.email)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()

  // Redirected to Keycloak's login form (standard ids).
  await page.waitForURL(/\/protocol\/openid-connect\/auth/, { timeout: 20_000 })
  await typeInto(page.locator('#username'), SSO_USER.username)
  await typeInto(page.locator('#password'), SSO_USER.password)
  await page.locator('#kc-login').click()

  // Back in the app with a session for the SSO user.
  await page.waitForURL((url) => url.host === 'localhost:3000' && !url.pathname.startsWith('/login'), { timeout: 20_000 })
  const sess = await page.request.get('/api/auth/get-session')
  const body = (await sess.json()) as { user?: { email?: string } } | null
  expect(body?.user?.email).toBe(SSO_USER.email)
})
