import { expect, test } from '@playwright/test'
import { dismissOnboarding, freshUser, signUp } from './helpers/auth'
import {
  cleanup,
  closeDb,
  getUserIdByEmail,
  scoreMatch,
  seedCompetitionWithMatch,
  seedLeagueMode,
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

test('an easy-mode league scores a correct outcome on its own board', async ({ page }) => {
  const user = freshUser()
  await signUp(page, user)
  const userId = await getUserIdByEmail(user.email)
  const leagueId = await seedLeagueMode(fixture.competitionId, userId, 'EASY')

  // A correct outcome call (HOME) on a HOME-win result scores the EASY base point.
  await seedUserPrediction(userId, fixture.matchId, 1, 0)
  await scoreMatch(fixture.matchId, 2, 1)

  // The dev server compiles this route on first hit; retry the cold navigation.
  await expect(async () => {
    await page.goto(`/leagues/${leagueId}`)
  }).toPass({ timeout: 30_000 })
  await dismissOnboarding(page)

  // The league carries its mode badge and renders the mode-specific board (not the
  // plain NORMAL leaderboard), with the member scored on it.
  await expect(page.getByText('Easy', { exact: true })).toBeVisible()
  await expect(page.getByText(user.name!)).toBeVisible()
  const points = page.getByText('pts', { exact: true }).locator('xpath=preceding-sibling::span[1]')
  await expect(points.first()).toHaveText('1')
})

test('a hardcore league shows its badge and a survival board', async ({ page }) => {
  const user = freshUser()
  await signUp(page, user)
  const userId = await getUserIdByEmail(user.email)
  const leagueId = await seedLeagueMode(fixture.competitionId, userId, 'HARDCORE', 3)

  // A correct outcome call keeps the member alive through the scored match.
  await seedUserPrediction(userId, fixture.matchId, 1, 0)
  await scoreMatch(fixture.matchId, 2, 1)

  await expect(async () => {
    await page.goto(`/leagues/${leagueId}`)
  }).toPass({ timeout: 30_000 })
  await dismissOnboarding(page)

  // The HARDCORE badge shows, and the survival board lists the member as alive.
  await expect(page.getByText('Hardcore', { exact: true })).toBeVisible()
  await expect(page.getByText(user.name!)).toBeVisible()
  await expect(page.getByText('Alive', { exact: true })).toBeVisible()
})
