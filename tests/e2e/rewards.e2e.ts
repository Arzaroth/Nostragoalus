import { expect, test } from '@playwright/test'
import { dismissOnboarding, freshUser, signUp } from './helpers/auth'
import {
  cleanup,
  closeDb,
  finishMatch,
  getUserIdByEmail,
  seedCompetitionWithMatch,
  seedLeague,
  seedScoredPrediction,
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

test('a league owner configures a prize and sees they are currently leading it', async ({ page }) => {
  const user = freshUser()
  await signUp(page, user)
  const userId = await getUserIdByEmail(user.email)
  const leagueId = await seedLeague(fixture.competitionId, userId)

  // The owner leads OVERALL: finish the match and score their exact prediction.
  await finishMatch(fixture.matchId, 1, 0)
  await seedScoredPrediction(userId, fixture.matchId, 1, 0, 3, 'EXACT')

  // The dev server compiles this route on first hit; retry the cold navigation.
  await expect(async () => {
    await page.goto(`/leagues/${leagueId}`)
  }).toPass({ timeout: 30_000 })
  await dismissOnboarding(page)

  // Configure the OVERALL prize (the first row in the edit dialog).
  const edit = page.getByRole('button', { name: 'Edit prizes' })
  await expect(edit).toBeVisible()
  await edit.click()
  const label = page.locator('.p-inputtext').first()
  await label.click()
  await label.pressSequentially('Un magnum de rosé', { delay: 5 })
  await page.getByRole('button', { name: 'Save prizes' }).click()

  // The prize shows on the league page, with the current leader being you.
  await expect(page.getByText('Un magnum de rosé')).toBeVisible()
  await expect(page.getByText("that's you!")).toBeVisible()
})
