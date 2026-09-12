import { test, expect } from '@playwright/test'
import { ADMIN, dismissOnboarding, signIn } from './helpers/auth'
import { closeDb, seedCompetitionWithMatch } from './helpers/db'

// The default competition used to be compiled in. Main path through the real UI:
// an admin picks a different tournament in the admin Competitions section, and a
// visitor with no `ng-competition` cookie then lands on that one - which is the
// whole point of moving it out of the build.

test.afterAll(async () => {
  await closeDb()
})

test('an admin changes the default competition and a cookie-less landing follows it', async ({ page }) => {
  const seeded = await seedCompetitionWithMatch()

  await signIn(page, ADMIN)
  await dismissOnboarding(page)

  await page.goto('/admin?section=competitions')
  await page.waitForLoadState('networkidle')

  const picker = page.locator('select').first()
  await expect(picker).toBeVisible()
  // It seeds from whatever the server resolved, so it is never blank.
  await expect(picker).not.toHaveValue('')

  const saveBtn = page.getByRole('button', { name: 'Save', exact: true }).first()

  // The section is SSR-rendered, so the select can exist before hydration wires
  // v-model: retry until the choice actually sticks and arms the button.
  await expect(async () => {
    await picker.selectOption(seeded.slug)
    await expect(picker).toHaveValue(seeded.slug)
    await expect(saveBtn).toBeEnabled()
  }).toPass({ timeout: 15_000 })

  await saveBtn.click()
  await expect(page.getByText('Saved.', { exact: true })).toBeVisible()

  // Reloading proves it persisted rather than only moving the local draft.
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.locator('select').first()).toHaveValue(seeded.slug)

  // The payoff: a visitor with no remembered competition is pointed at the new
  // default. The landing CTA is built from the same resolved value.
  await page.context().clearCookies({ name: 'ng-competition' })
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await expect(page.locator(`a[href="/${seeded.slug}/matches"]`).first()).toBeVisible()
})
