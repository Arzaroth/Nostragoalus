import { test, expect } from '@playwright/test'
import { ADMIN, dismissOnboarding, signIn } from './helpers/auth'
import {
  E2E_ALT_SLUG,
  cleanup,
  cleanupAlt,
  clearDefaultCompetition,
  closeDb,
  seedAltCompetition,
  seedCompetitionWithMatch,
} from './helpers/db'

// The remembered competition (ng-competition cookie) feeds every slug-less link.
// Archiving the one you were last browsing used to leave them all pointing at a
// 404 until the cookie expired.

test.beforeAll(async () => {
  await clearDefaultCompetition()
})

test.afterAll(async () => {
  await clearDefaultCompetition()
  await cleanupAlt()
  await cleanup()
  await closeDb()
})

test('archiving the competition you were browsing sends the nav back to an active one', async ({ page }) => {
  const seeded = await seedCompetitionWithMatch()
  await seedAltCompetition()

  await signIn(page, ADMIN)
  await dismissOnboarding(page)

  await page.goto(`/${E2E_ALT_SLUG}/matches`)
  await page.waitForLoadState('networkidle')
  await expect.poll(async () => (await page.context().cookies()).find((c) => c.name === 'ng-competition')?.value).toBe(E2E_ALT_SLUG)

  await page.goto('/admin?section=competitions')
  await page.waitForLoadState('networkidle')
  const row = page.locator('tr', { has: page.getByText(E2E_ALT_SLUG, { exact: true }) })
  await expect(async () => {
    await row.getByRole('button', { name: 'Archive' }).click({ timeout: 2_000 })
    await expect(row.getByRole('button', { name: 'Restore' })).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 15_000 })

  await expect(page.locator(`a[href="/${E2E_ALT_SLUG}/matches"]`)).toHaveCount(0)

  // A fresh load still carries the stale cookie; the links must not trust it.
  await page.goto('/admin')
  await page.waitForLoadState('networkidle')
  await expect(page.locator(`a[href="/${E2E_ALT_SLUG}/matches"]`)).toHaveCount(0)
  await expect(async () => {
    await page.locator(`a[href="/${seeded.slug}/matches"]`).first().click({ timeout: 2_000 })
    await expect(page).toHaveURL(new RegExp(`/${seeded.slug}/matches`), { timeout: 2_000 })
  }).toPass({ timeout: 15_000 })
  await expect(page.getByText('Competition not found')).toHaveCount(0)
})
