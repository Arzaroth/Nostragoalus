import { expect, test } from '@playwright/test'
import { dismissOnboarding, freshUser, signUp } from './helpers/auth'
import {
  cleanup,
  closeDb,
  getUserIdByEmail,
  seedCompetitionWithMatch,
  seedFinishedExactPrediction,
  type SeededFixture,
} from './helpers/db'

let fixture: SeededFixture
test.beforeAll(async () => {
  fixture = await seedCompetitionWithMatch()
})
test.afterAll(async () => {
  await cleanup()
  await closeDb()
})

// The analytics page turns the signed-in user's scored picks into a bias report.
// Seed one scored pick, then drive the real page and confirm the report renders
// (rather than the empty state).
test('the analytics page shows a bias report once a pick is scored', async ({ page }) => {
  const user = freshUser()
  await signUp(page, user)
  const userId = await getUserIdByEmail(user.email)

  // A settled, scored EXACT pick, so the analytics query (which reads only
  // predictions with total_points) has real data to report.
  await seedFinishedExactPrediction(userId, fixture.matchId, 8)

  await expect(async () => {
    await page.goto(`/${fixture.slug}/analytics`)
  }).toPass({ timeout: 30_000 })
  await dismissOnboarding(page)

  const report = page.locator('[data-test=analytics-report]')
  await expect(report).toBeVisible({ timeout: 10_000 })
  // An exact 2-1 call lands in the tier mix and as the best call.
  await expect(page.getByText('Best call')).toBeVisible()
})
