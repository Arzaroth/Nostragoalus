import { expect, test } from '@playwright/test'
import { dismissOnboarding, freshUser, signUp } from './helpers/auth'
import { E2E_TABLE_SLUG, cleanupSingleTable, closeDb, seedSingleTableCompetition } from './helpers/db'

// A competition played as one table, with no pool letter on any fixture. Before
// the rounds were derived from the fixtures themselves this could not exist:
// every match was filed under a round nothing looked for and dropped at insert,
// so the tournament was simply unaddable. The point of the spec is that the app
// carries a group-less competition all the way to a saved prediction.
test.beforeAll(async () => {
  await seedSingleTableCompetition()
})
test.afterAll(async () => {
  await cleanupSingleTable()
  await closeDb()
})

test('a single-table competition runs its rounds and takes a prediction', async ({ page }) => {
  await signUp(page, freshUser('e2e-table'))
  await page.goto(`/${E2E_TABLE_SLUG}/matches`)
  await dismissOnboarding(page)

  // Round 1, not "Group Matchday 1": the competition has no groups to name.
  await expect(page.getByText('France')).toBeVisible()
  await expect(page.getByText('Round 1')).toBeVisible()

  // All five rounds reached the database, which is the regression: the old
  // derivation gave every fixture the same round, or none at all.
  const rounds = page.getByText(/^Round [1-5]$/)
  await expect(rounds).toHaveCount(5)

  // Three matches in the round, each team once - the shape the derivation is
  // built on, seen from the outside.
  for (const team of ['France', 'Ireland', 'England', 'Scotland', 'Wales', 'Italy']) {
    await expect(page.getByText(team, { exact: true }).first()).toBeVisible()
  }

  // And it behaves like any other competition: a pick saves against its round.
  const home = page.locator('input[type="number"]').first()
  const away = page.locator('input[type="number"]').nth(1)
  await expect(async () => {
    await home.fill('21')
    await away.fill('17')
    await expect(home).toHaveValue('21')
  }).toPass({ timeout: 15_000 })

  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.locator('input[type="number"]').first()).toHaveValue('21')
})
