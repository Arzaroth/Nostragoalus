import { test, expect } from '@playwright/test'
import { dismissOnboarding, freshUser, signUp } from './helpers/auth'
import { cleanup, closeDb, seedCompetitionWithMatch, type SeededFixture } from './helpers/db'

// The spotlight onboarding tour: a full-screen overlay that dims the page and
// steps a new user through the core actions. It auto-starts once for a fresh
// account right after the league-onboarding prompt is dismissed. This drives
// that real primary path end to end - auto-start, every step, finish - and
// asserts it stays dismissed on reload.
let fixture: SeededFixture

test.beforeAll(async () => {
  fixture = await seedCompetitionWithMatch()
})
test.afterAll(async () => {
  await cleanup()
  await closeDb()
})

test('the onboarding tour auto-starts, walks the steps, and stays dismissed', async ({ page }) => {
  await signUp(page, freshUser())

  // Signup leaves the app mid-redirect; an immediate goto can be aborted by that
  // in-flight navigation, so retry on abort (same shape as pickers.e2e).
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(`/${fixture.slug}/matches`, { waitUntil: 'domcontentloaded' })
      break
    } catch (e) {
      if (attempt >= 3) throw e
    }
  }
  await page.waitForLoadState('networkidle')

  // Dismissing the fresh account's league prompt settles it and refreshes the
  // session, which is exactly what lets the tour auto-start in this session.
  await dismissOnboarding(page)

  // Auto-start: the welcome step (centered, no target) appears without any
  // further action.
  await expect(page.getByText('Welcome to Nostragoalus!')).toBeVisible({ timeout: 15_000 })

  // Advance through every step to the finale. Targeted steps whose element is
  // absent (e.g. chat, with no league) self-skip, so just keep pressing Next
  // until the final step shows.
  for (let i = 0; i < 12; i++) {
    if (await page.getByText("You're all set!").isVisible().catch(() => false)) break
    await page
      .getByRole('button', { name: 'Next', exact: true })
      .click({ timeout: 5000 })
      .catch(() => {})
  }
  await expect(page.getByText("You're all set!")).toBeVisible()

  await page.getByRole('button', { name: 'Got it', exact: true }).click()
  await expect(page.getByText("You're all set!")).toBeHidden()

  // Finished once = dismissed for good: a reload does not re-open it.
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.getByText('Welcome to Nostragoalus!')).toBeHidden()
})
