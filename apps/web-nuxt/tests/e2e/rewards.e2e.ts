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

  // Add an OVERALL prize: the edit dialog starts empty, so pick the criterion from
  // the dropdown, add it, then fill the prize label.
  const edit = page.getByRole('button', { name: 'Edit prizes' })
  await expect(edit).toBeVisible()
  await edit.click()
  await page.locator('select').selectOption({ label: 'Overall Winner' })
  await page.getByRole('button', { name: 'Add prize' }).click()
  const label = page.locator('.p-inputtext').first()
  await label.click()
  await label.pressSequentially('Un magnum de rosé', { delay: 5 })
  await page.getByRole('button', { name: 'Save prizes' }).click()

  // The prize shows on the league page, with the current leader being you.
  await expect(page.getByText('Un magnum de rosé')).toBeVisible()
  await expect(page.getByText("that's you!")).toBeVisible()

  // Clicking the prize opens its live ranking, where you sit on top with points.
  // The card is SSR-rendered; retry until hydration wires the click handler.
  await expect(async () => {
    await page.getByText('Un magnum de rosé').click()
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 15_000 })
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('3 pts')).toBeVisible()
  await expect(dialog.getByText("that's you!")).toBeVisible()
  await page.keyboard.press('Escape')
})

test('a league owner writes a markdown description that renders for viewers', async ({ page }) => {
  const user = freshUser()
  await signUp(page, user)
  const userId = await getUserIdByEmail(user.email)
  const leagueId = await seedLeague(fixture.competitionId, userId)

  await expect(async () => {
    await page.goto(`/leagues/${leagueId}`)
  }).toPass({ timeout: 30_000 })
  await dismissOnboarding(page)

  const addDesc = page.getByRole('button', { name: 'Add a description' })
  await expect(addDesc).toBeVisible()
  await addDesc.click()
  const editor = page.getByRole('textbox', { name: 'About this league' })
  await editor.fill('## House rules\n\nBe **nice** to each other.')
  // The dialog footer Save (common.save), not the prizes "Save prizes".
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click()

  // The rendered markdown shows on the league page (sanitized, as real elements).
  await expect(page.getByRole('heading', { name: 'House rules' })).toBeVisible()
  await expect(page.getByText('nice', { exact: false })).toBeVisible()
})
