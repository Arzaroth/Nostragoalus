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

test('creating a hardcore league via the dialog carries its mode and lives', async ({ page }) => {
  const user = freshUser()
  await signUp(page, user)

  // Open the create dialog on the leagues page and pick HARDCORE, which reveals a
  // lives input; the competition select defaults to the seeded e2e cup.
  await expect(async () => {
    await page.goto('/leagues?create=1')
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })
  }).toPass({ timeout: 30_000 })
  const dialog = page.getByRole('dialog')

  // Competition select is a PrimeVue combobox; open it and choose the e2e cup.
  await dialog.getByRole('combobox').click()
  await page.getByRole('option', { name: 'E2E Cup' }).click()

  await dialog.getByPlaceholder(/name/i).first().pressSequentially('Survivors', { delay: 5 })
  await dialog.getByText('Hardcore', { exact: true }).click()
  // Lives input appears only for HARDCORE.
  await expect(dialog.getByText('Lives', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Create' }).click()

  // The new hardcore league shows its badge in the list.
  await expect(page.getByText('Hardcore', { exact: true })).toBeVisible({ timeout: 15_000 })
})
