import { test, expect } from '@playwright/test'
import { freshUser, signUp } from './helpers/auth'
import { closeDb } from './helpers/db'

// Mobile-connection hardening, main paths through the real app:
//  1. A failed getSession() (flaky 4G: packet loss / CGNAT drop / tower handoff)
//     must NOT bounce a signed-in user to /login - the cookie is still valid.
//  2. The live WebSocket answers the client keepalive ping with a pong, so the
//     client can detect a silently half-open socket and reconnect.

test.afterAll(async () => {
  await closeDb()
})

test('a failed getSession does not eject a signed-in user to /login', async ({ page }) => {
  const user = freshUser('resilience')
  await signUp(page, user) // verified, signed in, onboarding dismissed

  // Baseline: the protected page loads normally while signed in.
  await page.goto('/account')
  await expect(page).toHaveURL(/\/account$/)

  // Open the user menu (the avatar lives in <ClientOnly>, so its visibility also
  // proves the app has hydrated - the next link click is a real client-side
  // navigation, not a full document load). Open it BEFORE aborting get-session,
  // so the session-gated menu is still mounted.
  const avatar = page.locator('header button:has(img[src*="/brand/avatar"])')
  await expect(avatar).toBeVisible()
  const prefLink = page.locator('a[href="/preferences"]')
  await expect(async () => {
    await avatar.click()
    await expect(prefLink).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 10_000 })

  // Simulate the roaming failure: the session probe the guard runs on every
  // client-side navigation fails (a 5xx/gateway hiccup on spotty mobile data,
  // not a 401), which better-auth surfaces as a transport `error` with a null
  // `data`. The guard runs only on the client (it server-bails), so this MUST be
  // an in-app SPA navigation - a page.goto would render server-side and never
  // hit the intercepted route, passing vacuously.
  let probed = false
  await page.route('**/api/auth/get-session**', (route) => {
    probed = true
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
  })

  // Follow the Preferences link (a NuxtLink = SPA nav). The old guard read the
  // resulting null `data` as logged-out and redirected; the fixed guard sees the
  // transport error and leaves the session alone.
  await prefLink.click()
  await expect(page).toHaveURL(/\/preferences$/)
  expect(new URL(page.url()).pathname).not.toBe('/login')
  // Prove the client guard actually ran its session probe (otherwise the "stayed
  // on /preferences" assertion would be meaningless).
  expect(probed).toBe(true)

  // With connectivity restored, navigation still works normally.
  await page.unroute('**/api/auth/get-session**')
  await page.goto('/account')
  await expect(page).toHaveURL(/\/account$/)
})

test('the live socket answers a keepalive ping with a pong', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')

  // Open a raw socket to /_ws and round-trip the app-level keepalive frame the
  // heartbeat sends. This exercises the real server handler over the live stack.
  const gotPong = await page.evaluate(async () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/_ws`)
    return await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        ws.close()
        resolve(false)
      }, 10_000)
      ws.onopen = () => ws.send(JSON.stringify({ type: 'ping' }))
      ws.onmessage = (event) => {
        try {
          if (JSON.parse(event.data)?.type === 'pong') {
            clearTimeout(timer)
            ws.close()
            resolve(true)
          }
        } catch {
          // ignore non-JSON frames
        }
      }
    })
  })

  expect(gotPong).toBe(true)
})
