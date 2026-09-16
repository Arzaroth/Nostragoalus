import { expect, test } from '@playwright/test'
import { dismissOnboarding, freshUser, signUp } from './helpers/auth'
import { E2E_TABLE_SLUG, cleanupSingleTable, closeDb, getMatchPrediction, seedSingleTableCompetition } from './helpers/db'

// A competition played as one table, with no pool letter on any fixture. Before
// the rounds were derived from the fixtures themselves this could not exist:
// every match was filed under a round nothing looked for and dropped at insert,
// so the tournament was simply unaddable. The point of the spec is that the app
// carries a group-less competition all the way to a saved prediction.
let seeded: Awaited<ReturnType<typeof seedSingleTableCompetition>>
test.beforeAll(async () => {
  seeded = await seedSingleTableCompetition()
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
  // France appears five times, once per round, which is what a round-robin is.
  await expect(page.getByText('France').first()).toBeVisible()
  await expect(page.getByText('Round 1').first()).toBeVisible()

  // Every round reached the database under its own number, which is the
  // regression: the old derivation filed them all under one round, where the
  // lookup then found none of them.
  await expect(page.getByText(/^Round [1-5]$/)).toHaveCount(5)

  // Each of the six teams plays in every round, so each is on the page five
  // times - the shape the derivation is built on, seen from the outside.
  for (const team of ['France', 'Ireland', 'England', 'Scotland', 'Wales', 'Italy']) {
    await expect(page.getByText(team, { exact: true })).toHaveCount(5)
  }

  // And it behaves like any other competition: a pick saves against its round,
  // which is the part that was impossible while the round did not exist.
  const card = page.locator(`#match-${seeded.matchId}`)
  await expect(card).toBeVisible({ timeout: 20_000 })
  // PrimeVue InputNumber ignores .fill() for its model, so clear then type.
  const scores = card.locator('input.ng-score-input')
  await scores.nth(0).fill('')
  await scores.nth(0).pressSequentially('21')
  await scores.nth(1).fill('')
  await scores.nth(1).pressSequentially('17')
  await scores.nth(1).press('Enter')
  await expect(card.locator('i.pi.pi-check')).toBeVisible({ timeout: 10_000 })
  await expect.poll(() => getMatchPrediction(seeded.matchId), { timeout: 8_000 }).toEqual({ home: 21, away: 17 })
})
