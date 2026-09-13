import { test, expect } from '@playwright/test'
import { ADMIN, dismissOnboarding, signIn } from './helpers/auth'
import { cleanup, closeDb, seedCompetitionWithMatch } from './helpers/db'

// The add-a-competition flow through the real UI, as far as it goes without an
// upstream: listing a provider's catalog is a live call to ESPN or World Rugby,
// which an e2e run must not make. What is covered here is everything the screen
// decides on its own - which providers it offers, and what it forgets when the
// provider changes - because that is where the reported bugs were.

test.afterAll(async () => {
  await cleanup()
  await closeDb()
})

test('every provider can be picked, and one with no catalog is added by id', async ({ page }) => {
  await seedCompetitionWithMatch()
  await signIn(page, ADMIN)
  await dismissOnboarding(page)

  await page.goto('/admin?section=competitions')
  await page.waitForLoadState('networkidle')

  const section = page.locator('section', { has: page.getByText('Default competition') })
  await expect(section.getByRole('button', { name: 'Add a competition' })).toBeVisible()

  // SSR-rendered, so the opener can exist before hydration wires its handler.
  await expect(async () => {
    await section.getByRole('button', { name: 'Add a competition' }).click()
    await expect(section.getByText('Provider', { exact: true })).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 15_000 })

  // It opens on a provider that can list its catalog: that is the guided path.
  const providerPicker = section.getByRole('combobox').nth(1)
  await expect(providerPicker).toContainText('espn')
  await expect(section.getByRole('button', { name: /List what it carries/ })).toBeVisible()

  // FIFA publishes no catalog and used not to be offered at all, even though
  // the probe and the save have always accepted it.
  await providerPicker.click()
  await page.getByRole('option', { name: 'fifa', exact: true }).click()

  await expect(section.getByText(/does not publish a list/)).toBeVisible()
  await expect(section.getByRole('button', { name: /List what it carries/ })).toHaveCount(0)
  await expect(section.getByRole('button', { name: 'Check it' })).toBeDisabled()

  // An id is enough to arm the same dry-run check the catalog path uses.
  await section.getByRole('textbox').first().fill('17')
  await expect(section.getByRole('button', { name: 'Check it' })).toBeEnabled()

  // Switching away drops the typed id with everything else, so nothing from one
  // provider is ever carried into another.
  await providerPicker.click()
  await page.getByRole('option', { name: 'worldrugby', exact: true }).click()
  await expect(section.getByText(/does not publish a list/)).toHaveCount(0)
  await expect(section.getByText('Sub-feed', { exact: true })).toBeVisible()

  await providerPicker.click()
  await page.getByRole('option', { name: 'fifa', exact: true }).click()
  await expect(section.getByRole('textbox').first()).toHaveValue('')
  await expect(section.getByRole('button', { name: 'Check it' })).toBeDisabled()
})
