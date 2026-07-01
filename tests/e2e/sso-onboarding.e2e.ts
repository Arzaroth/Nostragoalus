import { test, expect, request, type APIRequestContext } from '@playwright/test'
import { ADMIN } from './helpers/auth'
import { closeDb, deleteUserByEmail, getUserByEmail, verifySsoDomain } from './helpers/db'

// Exercises the onboarding lifecycle gate, the login resolver, and SCIM
// provisioning/deprovisioning over real HTTP against the dockerized stack +
// Keycloak. Opt-in on E2E_SSO (the connection test fetches Keycloak's discovery
// document, so the IdP must be up). Driven through the admin API; no browser.
const APP = process.env.E2E_APP_URL ?? 'http://localhost:3000'
const PROVIDER_ID = 'lifecycle-e2e'
const SSO_DOMAIN = 'e2e-lifecycle.test'
const KC_ISSUER = process.env.E2E_KC_ISSUER ?? 'http://keycloak:8080/realms/nostragoalus-e2e'
const SCIM_EMAIL = 'scim-provisioned@e2e-lifecycle.test'
const SSO_ENABLED = !!process.env.E2E_SSO

async function adminContext(): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: APP })
  const r = await ctx.post('/api/auth/sign-in/email', {
    headers: { Origin: APP },
    data: { email: ADMIN.email, password: ADMIN.password },
  })
  if (!r.ok()) throw new Error(`admin sign-in failed: ${r.status()}`)
  return ctx
}

async function resolvedProvider(ctx: APIRequestContext, email: string): Promise<string | null> {
  const r = await ctx.get(`/api/sso/check?email=${encodeURIComponent(email)}`)
  return ((await r.json()) as { providerId: string | null }).providerId
}

let admin: APIRequestContext

test.beforeAll(async () => {
  if (!SSO_ENABLED) return
  admin = await adminContext()
  await admin.delete(`/api/admin/sso/${PROVIDER_ID}`).catch(() => {})
  await deleteUserByEmail(SCIM_EMAIL).catch(() => {})
  const res = await admin.post('/api/admin/sso', {
    data: {
      providerId: PROVIDER_ID,
      type: 'oidc',
      issuer: KC_ISSUER,
      clientId: 'nostragoalus-app',
      clientSecret: 'e2e-keycloak-secret',
      domains: SSO_DOMAIN,
      name: 'Lifecycle E2E',
    },
  })
  if (!res.ok()) throw new Error(`register failed: ${res.status()} ${await res.text()}`)
})

test.afterAll(async () => {
  if (!SSO_ENABLED) return
  await admin.delete(`/api/admin/sso/${PROVIDER_ID}`).catch(() => {})
  await deleteUserByEmail(SCIM_EMAIL).catch(() => {})
  await admin.dispose()
  await closeDb()
})

test('enable is gated on a passing test + verified domain, and disabling hides the provider', async () => {
  test.skip(!SSO_ENABLED, 'set E2E_SSO=1 and bring up Keycloak (--profile e2e)')

  // Fresh draft: not yet offered for login.
  expect(await resolvedProvider(admin, `someone@${SSO_DOMAIN}`)).toBeNull()

  // Enabling before a test fails (409).
  const noTest = await admin.put(`/api/admin/sso/${PROVIDER_ID}/status`, { data: { status: 'enabled' } })
  expect(noTest.status()).toBe(409)

  // Connection test passes against Keycloak.
  const tc = await admin.post(`/api/admin/sso/${PROVIDER_ID}/test-connection`)
  expect(tc.ok()).toBeTruthy()
  expect(((await tc.json()) as { ok: boolean }).ok).toBe(true)

  // Still gated until the domain is verified.
  const noDomain = await admin.put(`/api/admin/sso/${PROVIDER_ID}/status`, { data: { status: 'enabled' } })
  expect(noDomain.status()).toBe(409)

  // Verify the domain, then enable succeeds and the resolver offers it.
  await verifySsoDomain(PROVIDER_ID)
  const enabled = await admin.put(`/api/admin/sso/${PROVIDER_ID}/status`, { data: { status: 'enabled' } })
  expect(enabled.ok()).toBeTruthy()
  expect(await resolvedProvider(admin, `someone@${SSO_DOMAIN}`)).toBe(PROVIDER_ID)

  // Disabling hides it again (existing sessions are untouched, not asserted here).
  const disabled = await admin.put(`/api/admin/sso/${PROVIDER_ID}/status`, { data: { status: 'disabled' } })
  expect(disabled.ok()).toBeTruthy()
  expect(await resolvedProvider(admin, `someone@${SSO_DOMAIN}`)).toBeNull()
})

test('SCIM provisions a user and active:false deprovisions (ban, data kept)', async () => {
  test.skip(!SSO_ENABLED, 'set E2E_SSO=1 and bring up Keycloak (--profile e2e)')

  const tokenRes = await admin.post(`/api/admin/sso/${PROVIDER_ID}/scim-token`)
  expect(tokenRes.ok()).toBeTruthy()
  const { scimToken, baseUrl } = (await tokenRes.json()) as { scimToken: string; baseUrl: string }
  expect(scimToken.length).toBeGreaterThan(10)

  const scim = await request.newContext({ extraHTTPHeaders: { authorization: `Bearer ${scimToken}` } })
  // Full URL (baseUrl already ends in /api/auth/scim/v2): a leading-slash path
  // against a baseURL resolves from the origin and would drop the base path.
  // SCIM requires application/scim+json; pass the body as a string so Playwright
  // doesn't override the content-type with application/json.
  const scimReq = (method: 'post' | 'patch', path: string, body: unknown) =>
    scim.fetch(`${baseUrl}${path}`, { method, headers: { 'content-type': 'application/scim+json' }, data: JSON.stringify(body) })

  const create = await scimReq('post', '/Users', {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    userName: SCIM_EMAIL,
    emails: [{ value: SCIM_EMAIL, primary: true }],
    active: true,
  })
  expect(create.ok()).toBeTruthy()
  const userId = ((await create.json()) as { id: string }).id

  let user = await getUserByEmail(SCIM_EMAIL)
  expect(user?.id).toBe(userId)
  expect(user?.banned).toBe(false)

  // Deprovision -> banned, data kept.
  const off = await scimReq('patch', `/Users/${userId}`, {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
    Operations: [{ op: 'replace', path: 'active', value: false }],
  })
  expect(off.ok()).toBeTruthy()
  user = await getUserByEmail(SCIM_EMAIL)
  expect(user?.banned).toBe(true)

  // Reactivate.
  const on = await scimReq('patch', `/Users/${userId}`, {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
    Operations: [{ op: 'replace', path: 'active', value: true }],
  })
  expect(on.ok()).toBeTruthy()
  expect((await getUserByEmail(SCIM_EMAIL))?.banned).toBe(false)
  await scim.dispose()
})

test('the SCIM management endpoints are blocked over HTTP even for an admin', async () => {
  test.skip(!SSO_ENABLED, 'set E2E_SSO=1 and bring up Keycloak (--profile e2e)')
  // Minting a provisioning bearer must go through our admin route, not the
  // plugin's session-only endpoint - the catch-all 404s it.
  const direct = await admin.post('/api/auth/scim/generate-token', { data: { providerId: PROVIDER_ID } })
  expect(direct.status()).toBe(404)
})
