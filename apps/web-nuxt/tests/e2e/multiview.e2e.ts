import { test, expect } from '@playwright/test'
import { freshUser, signUp } from './helpers/auth'
import { cleanup, closeDb, seedCompetitionWithMatch, type SeededFixture } from './helpers/db'

let fixture: SeededFixture

test.beforeAll(async () => {
  fixture = await seedCompetitionWithMatch()
})
test.afterAll(async () => {
  await cleanup()
  await closeDb()
})

// The multi-view money path through the real UI: land on an empty grid, add a
// seeded match from the picker, switch the layout, and confirm the whole thing
// (cells + layout) round-trips through the URL across a reload.
test('multiview: add a match to a cell, switch layout, persist across reload', async ({ page }) => {
  await signUp(page, freshUser())
  await page.goto(`/${fixture.slug}/multiview`)

  // Default 2x2 -> four "Add match" placeholders. (No networkidle wait: the grid
  // holds a live WebSocket, so the network never idles - wait on the placeholder.)
  const addSlots = page.getByRole('button', { name: 'Add match' })
  await expect(addSlots.first()).toBeVisible({ timeout: 20_000 })
  await expect(addSlots).toHaveCount(4)

  // Open the fixture picker. The placeholder renders in SSR, so a click can land
  // before hydration attaches the handler and be lost - retry until it opens.
  const dialog = page.locator('.p-dialog')
  await expect(async () => {
    await addSlots.first().click()
    await expect(dialog).toBeVisible({ timeout: 1_500 })
  }).toPass({ timeout: 20_000 })

  // Select the seeded match.
  await expect(dialog.getByPlaceholder('Search a team…')).toBeVisible()
  await dialog.getByRole('button').filter({ hasText: fixture.home.name }).first().click()

  // The cell now shows the teams, the URL carries the match id, and one slot is
  // consumed (three placeholders left in the 2x2).
  await expect(page.getByText(fixture.home.name).first()).toBeVisible({ timeout: 10_000 })
  await expect(page).toHaveURL(new RegExp(`cells=${fixture.matchId}`))
  await expect(page.getByRole('button', { name: 'Add match' })).toHaveCount(3)

  // Switch to the single-panel layout: the URL records it and the cell survives.
  await page.getByRole('button', { name: 'Switch to 1 layout' }).click()
  await expect(page).toHaveURL(/layout=1/)
  await expect(page.getByText(fixture.home.name).first()).toBeVisible()

  // A hard reload rebuilds the grid from the URL alone.
  await page.reload()
  await expect(page).toHaveURL(new RegExp(`cells=${fixture.matchId}`))
  await expect(page).toHaveURL(/layout=1/)
  await expect(page.getByText(fixture.home.name).first()).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Add match' })).toHaveCount(0)
})
