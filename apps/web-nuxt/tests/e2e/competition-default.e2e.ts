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

// The default competition used to be compiled in. Main path through the real UI:
// an admin picks a different tournament in the admin Competitions section, and a
// visitor with no `ng-competition` cookie then lands on that one - which is the
// whole point of moving it out of the build.

// The default is one global row and the e2e database outlives a single run, so
// this spec both starts from a known state and puts it back. Without the reset
// it poisons its own next run, and any later spec whose landing resolves through
// the default lands on a competition this file's cleanup has since deleted.
test.beforeAll(async () => {
  await clearDefaultCompetition()
})

test.afterAll(async () => {
  await clearDefaultCompetition()
  await cleanupAlt()
  await cleanup()
  await closeDb()
})

test('an admin changes the default competition and a cookie-less landing follows it', async ({ page }) => {
  // Two competitions, because the test is that the default MOVES. The e2e stack
  // seeds none of its own, so with a single competition it is already the
  // default and there is nothing to switch to.
  const seeded = await seedCompetitionWithMatch() // e2e-cup, season 2026
  await seedAltCompetition() // e2e-alt, season 2025

  await signIn(page, ADMIN)
  await dismissOnboarding(page)

  await page.goto('/admin?section=competitions')
  await page.waitForLoadState('networkidle')

  // Scoped to the competitions section: the admin page keeps every other
  // section mounted, so an unscoped `select` or `Save` can match a neighbour.
  const section = page.locator('section', { has: page.getByText('Default competition') })
  const picker = section.locator('select').first()
  const saveBtn = section.getByRole('button', { name: 'Save', exact: true })

  // Nothing stored, so the resolver falls back to the newest season: e2e-cup.
  await expect(picker).toBeVisible()
  await expect(picker).toHaveValue(seeded.slug)
  await expect(saveBtn).toBeDisabled()

  // SSR-rendered, so the control can exist before hydration wires v-model:
  // retry until the choice sticks and arms Save.
  await expect(async () => {
    await picker.selectOption(E2E_ALT_SLUG)
    await expect(picker).toHaveValue(E2E_ALT_SLUG)
    await expect(saveBtn).toBeEnabled()
  }).toPass({ timeout: 15_000 })

  await saveBtn.click()
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible()

  // Reloading proves it persisted rather than only moving the local draft.
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(section.locator('select').first()).toHaveValue(E2E_ALT_SLUG)

  // The payoff: a visitor with no remembered competition is pointed at the new
  // default, even though it is NOT the newest season - which is what proves the
  // stored setting wins rather than coincidentally agreeing with the fallback.
  await page.context().clearCookies({ name: 'ng-competition' })
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await expect(page.locator(`a[href="/${E2E_ALT_SLUG}/matches"]`).first()).toBeVisible()
})
