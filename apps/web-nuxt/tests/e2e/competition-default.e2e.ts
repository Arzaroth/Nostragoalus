import { test, expect } from '@playwright/test'
import { ADMIN, dismissOnboarding, signIn } from './helpers/auth'
import {
  E2E_BRACKET_SLUG,
  cleanup,
  cleanupBracket,
  closeDb,
  seedCompetitionWithMatch,
  seedFixtureBracketCompetition,
} from './helpers/db'

// The default competition used to be compiled in. Main path through the real UI:
// an admin picks a different tournament in the admin Competitions section, and a
// visitor with no `ng-competition` cookie then lands on that one - which is the
// whole point of moving it out of the build.

test.afterAll(async () => {
  await cleanupBracket()
  await cleanup()
  await closeDb()
})

test('an admin changes the default competition and a cookie-less landing follows it', async ({ page }) => {
  // Two competitions, because the test is that the default MOVES. The e2e stack
  // seeds none of its own, so with a single competition it is already the
  // default and there is nothing to switch to.
  const seeded = await seedCompetitionWithMatch() // e2e-cup, season 2026
  await seedFixtureBracketCompetition() // e2e-bracket, season 2025

  await signIn(page, ADMIN)
  await dismissOnboarding(page)

  await page.goto('/admin?section=competitions')
  await page.waitForLoadState('networkidle')

  // Scoped to the competitions section: the admin page keeps every other
  // section mounted, so an unscoped `select` or `Save` can match a neighbour.
  const section = page.locator('section', { has: page.getByText('Default competition') })
  const picker = section.locator('select').first()
  const saveBtn = section.getByRole('button', { name: 'Save', exact: true })

  // Newest season leads, so the resolved default starts on e2e-cup (2026).
  await expect(picker).toBeVisible()
  await expect(picker).toHaveValue(seeded.slug)
  await expect(saveBtn).toBeDisabled()

  // SSR-rendered, so the control can exist before hydration wires v-model:
  // retry until the choice sticks and arms Save.
  await expect(async () => {
    await picker.selectOption(E2E_BRACKET_SLUG)
    await expect(picker).toHaveValue(E2E_BRACKET_SLUG)
    await expect(saveBtn).toBeEnabled()
  }).toPass({ timeout: 15_000 })

  await saveBtn.click()
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible()

  // Reloading proves it persisted rather than only moving the local draft.
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(section.locator('select').first()).toHaveValue(E2E_BRACKET_SLUG)

  // The payoff: a visitor with no remembered competition is pointed at the new
  // default, even though it is not the newest season. The landing CTA is built
  // from the same resolved value.
  await page.context().clearCookies({ name: 'ng-competition' })
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await expect(page.locator(`a[href="/${E2E_BRACKET_SLUG}/matches"]`).first()).toBeVisible()
})
