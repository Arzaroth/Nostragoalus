import { test, expect, request } from '@playwright/test'
import { freshUser, signUp } from './helpers/auth'
import { closeDb } from './helpers/db'

// Connected-devices main path through the real UI: a signed-in user sees their
// current device, a second sign-in shows up as another device, and "sign out all
// other devices" leaves only the current one.
const APP = process.env.E2E_APP_URL ?? 'http://localhost:3000'

test.afterAll(async () => {
  await closeDb()
})

test('lists connected devices and signs out the others', async ({ page }) => {
  const user = freshUser('sessions')
  await signUp(page, user) // verified, signed in, onboarding dismissed

  await page.goto('/account')
  await page.waitForLoadState('networkidle')

  // The account page lists this one device, badged as the current one.
  const rows = page.locator('.ng-session-row')
  await expect(rows).toHaveCount(1)
  await expect(page.getByText('This device')).toBeVisible()

  // Open a second session for the same user (a "second device") via the API.
  // The context is disposed, but its session row persists in the DB.
  const other = await request.newContext({ baseURL: APP })
  const signin = await other.post('/api/auth/sign-in/email', {
    headers: { Origin: APP },
    data: { email: user.email, password: user.password },
  })
  expect(signin.ok()).toBeTruthy()
  await other.dispose()

  // A fresh load now shows two devices.
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(rows).toHaveCount(2)

  // Sign out the other device. The control is SSR-rendered, so gate the click on
  // interactivity: retry until the handler is wired and the list collapses.
  const revokeOthers = page.getByRole('button', { name: 'Sign out all other devices' })
  await expect(async () => {
    await revokeOthers.click()
    await expect(rows).toHaveCount(1)
  }).toPass({ timeout: 15_000 })

  // Only the current device remains, and the bulk control is now disabled.
  await expect(page.getByText('This device')).toBeVisible()
  await expect(revokeOthers).toBeDisabled()
})
