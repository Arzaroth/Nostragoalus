import { readFileSync } from 'node:fs'
import { expect, test, type Download, type Page } from '@playwright/test'
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

// Add an OVERALL prize through the owner's edit dialog: the form starts empty, so
// pick the criterion from the dropdown, add it, then fill the prize label.
async function addOverallPrize(page: Page, label: string) {
  const edit = page.getByRole('button', { name: 'Edit prizes' })
  await expect(edit).toBeVisible()
  await edit.click()
  await page.locator('select').selectOption({ label: 'Overall Winner' })
  await page.getByRole('button', { name: 'Add prize' }).click()
  const input = page.locator('.p-inputtext').first()
  await input.click()
  await input.pressSequentially(label, { delay: 5 })
  await page.getByRole('button', { name: 'Save prizes' }).click()
  await expect(page.getByText(label)).toBeVisible()
}

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

  await addOverallPrize(page, 'Un magnum de rosé')

  // The prize shows on the league page, with the current leader being you.
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

test('a league manager exports the prize winners with their email as CSV', async ({ page }) => {
  const user = freshUser()
  await signUp(page, user)
  const userId = await getUserIdByEmail(user.email)
  const leagueId = await seedLeague(fixture.competitionId, userId)

  await finishMatch(fixture.matchId, 2, 1)
  await seedScoredPrediction(userId, fixture.matchId, 2, 1, 3, 'EXACT')

  await expect(async () => {
    await page.goto(`/leagues/${leagueId}`)
  }).toPass({ timeout: 30_000 })
  await dismissOnboarding(page)

  await addOverallPrize(page, 'A crate of beer')

  // The export is a download built in the browser; retry the first click until
  // hydration has wired it.
  const exportButton = page.getByRole('button', { name: 'Export winners (CSV)' })
  await expect(exportButton).toBeVisible()
  let download: Download | undefined
  await expect(async () => {
    const pending = page.waitForEvent('download', { timeout: 2_000 })
    await exportButton.click()
    download = await pending
  }).toPass({ timeout: 20_000 })

  expect(download!.suggestedFilename()).toMatch(/^prizes-.*\.csv$/)
  const csv = readFileSync((await download!.path())!, 'utf8')
  expect(csv.split('\r\n')[0]).toContain('criterion,prize,player,email,metric,value')
  expect(csv).toContain('OVERALL,A crate of beer')
  expect(csv).toContain(user.email)
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
