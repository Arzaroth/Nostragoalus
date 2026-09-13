import { expect, test } from '@playwright/test'
import { dismissOnboarding, freshUser, signUp } from './helpers/auth'
import { cleanup, cleanupRugby, closeDb, seedCompetitionWithMatch, seedRugbyCompetition, E2E_RUGBY_SLUG, E2E_SLUG } from './helpers/db'

// The sport-aware surfaces, driven through the real UI. The competition is
// seeded straight into the database rather than ingested: the isolated stack's
// `fixture` provider serves football only, and what is under test here is how
// the app renders a rugby competition, not how it fetches one.
test.beforeAll(async () => {
  // Both, so the football control is a competition this spec owns rather than
  // whatever the slug-less default happens to resolve to.
  await seedCompetitionWithMatch()
  await seedRugbyCompetition()
})
test.afterAll(async () => {
  await cleanupRugby()
  await cleanup()
  await closeDb()
})

test('a rugby competition wears its own mark and splits tries from points', async ({ page }) => {
  await signUp(page, freshUser('e2e-rugby'))
  await page.goto(`/${E2E_RUGBY_SLUG}/matches`)
  await dismissOnboarding(page)
  await expect(page.getByText('France')).toBeVisible()

  // The header mark: the football is a pentagon constellation, the rugby one an
  // ellipse with a seam. Asserted on the shape, since both are inline SVG.
  const mark = page.locator('.logo-mark').first()
  await expect(mark).toBeVisible()
  await expect(mark.locator('ellipse[rx="62"][ry="38"]')).toHaveCount(1)

  // Stats: a try board and a points board, not scorers and assists. The seeded
  // kicker outscores the winger on points while never scoring a try.
  await page.getByRole('button', { name: 'Stats' }).click()
  await expect(page.getByText('Top try scorers')).toBeVisible()
  await expect(page.getByText('Most points')).toBeVisible()
  await expect(page.getByText('Top assists')).toHaveCount(0)

  const boards = page.locator('section:has(table)')
  await expect(boards.filter({ hasText: 'Top try scorers' }).getByText('E2E Winger')).toBeVisible()
  // The kicker appears only on the points board - two tries is 10, seven kicks
  // is 13, and neither board would show both leaders on its own.
  await expect(boards.filter({ hasText: 'Top try scorers' }).getByText('E2E Kicker')).toHaveCount(0)
  const points = boards.filter({ hasText: 'Most points' })
  await expect(points.getByText('E2E Kicker')).toBeVisible()
  await expect(points.locator('tbody tr').first()).toContainText('E2E Kicker')
})

test('a football competition is unchanged', async ({ page }) => {
  await signUp(page, freshUser('e2e-fb'))
  await page.goto(`/${E2E_SLUG}/matches`)
  await dismissOnboarding(page)

  // A football competition keeps the pentagon mark and the football headings.
  const mark = page.locator('.logo-mark').first()
  await expect(mark).toBeVisible()
  await expect(mark.locator('ellipse[rx="62"][ry="38"]')).toHaveCount(0)

  await page.getByRole('button', { name: 'Stats' }).click()
  await expect(page.getByText('Top scorers')).toBeVisible()
  await expect(page.getByText('Most points')).toHaveCount(0)
})
