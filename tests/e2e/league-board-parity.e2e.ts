import { expect, test } from '@playwright/test'
import { dismissOnboarding, freshUser, signUp } from './helpers/auth'
import {
  cleanup,
  closeDb,
  getUserIdByEmail,
  scoreMatch,
  seedCompetitionWithMatch,
  seedLeague,
  seedUserPrediction,
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

// The per-league NORMAL board now renders through the shared LeaderboardRowCard
// (same component as the competition board), so it gains the richer row markup
// (movement/crown/boot/live) instead of its old degraded copy. This drives the
// real UI to confirm the shared card is wired on the league page and highlights
// the viewer's own row.
test('a normal-mode league renders its board through the shared row card', async ({ page }) => {
  const user = freshUser()
  await signUp(page, user)
  const userId = await getUserIdByEmail(user.email)
  const leagueId = await seedLeague(fixture.competitionId, userId)

  await seedUserPrediction(userId, fixture.matchId, 1, 0)
  await scoreMatch(fixture.matchId, 2, 1)

  // The dev server compiles this route on first hit; retry the cold navigation.
  await expect(async () => {
    await page.goto(`/leagues/${leagueId}`)
  }).toPass({ timeout: 30_000 })
  await dismissOnboarding(page)

  const rowCard = page.locator('[data-test=leaderboard-row]', { hasText: user.name! })
  await expect(rowCard).toBeVisible({ timeout: 10_000 })
  // Signed-in owner is their own row: the shared card highlights it with a
  // thicker border, proving the me-highlight travelled from the competition board.
  await expect(rowCard).toHaveAttribute('style', /border-width:\s*2px/)
})
