import type { APIRequestContext } from '@playwright/test'

// Wait for Keycloak to finish importing its realm, through the app.
//
// `e2e-up` starts Keycloak with `up -d`, which returns immediately, while
// `start-dev --import-realm` takes ~30-60s. Nothing used to wait on it: the SSO
// specs passed because they run last alphabetically, so Keycloak had minutes of
// other specs to come up in. On a cold or slow machine the provider
// registration fires first and `test-connection` fails against an IdP whose
// discovery document is not being served yet.
//
// Polled through the app rather than directly: E2E_KC_ISSUER is the
// docker-internal `http://keycloak:8080/...`, which the Playwright process on
// the host cannot resolve. The app can, and `test-connection` is exactly the
// call that fetches the discovery document - so retrying it both waits for
// readiness and performs the step the caller wanted.
export async function testConnectionWhenReady(
  admin: APIRequestContext,
  providerId: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 120_000
  const intervalMs = opts.intervalMs ?? 3_000
  const deadline = Date.now() + timeoutMs
  let last = ''

  for (;;) {
    const res = await admin.post(`/api/admin/sso/${providerId}/test-connection`)
    if (res.ok()) return
    last = `${res.status()} ${await res.text()}`
    if (Date.now() >= deadline) break
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error(
    `sso test-connection never succeeded within ${timeoutMs}ms - Keycloak's realm import `
    + `probably had not finished. Last response: ${last}`,
  )
}
