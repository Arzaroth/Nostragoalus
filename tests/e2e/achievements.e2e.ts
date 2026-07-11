import { expect, test } from '@playwright/test'
import { dismissOnboarding, freshUser, signUp } from './helpers/auth'
import {
  cleanup,
  closeDb,
  getShowcasePins,
  getUserIdByEmail,
  scoreMatch,
  seedAchievement,
  seedCompetitionWithMatch,
  seedScoredPrediction,
  seedTrophy,
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

test('the trophy cabinet shows earned items and the owner can pin one to the showcase', async ({ page }) => {
  const user = freshUser()
  await signUp(page, user)
  const userId = await getUserIdByEmail(user.email)

  // One trophy (overall winner) + a few badges for the signed-in user: the renamed
  // opener (key opening-act, shown "First Blood"), the renamed first-exact (key
  // first-blood, shown "The Hunt Is On"), a new milestone (grand-finale) and a SHAME
  // "bad" badge, to prove the catalog - renames and new badges included - surfaces.
  await seedTrophy(fixture.competitionId, userId, 'OVERALL', 42)
  await seedAchievement(userId, fixture.competitionId, 'first-blood', 'BRONZE')
  await seedAchievement(userId, fixture.competitionId, 'opening-act', 'GOLD')
  await seedAchievement(userId, fixture.competitionId, 'grand-finale', 'GOLD')
  await seedAchievement(userId, fixture.competitionId, 'wooden-spoon', 'BRONZE')
  // The three correct-outcome badges (graded Form Reader, single-gold Champion's
  // Path, revocable Group Guru) so the new catalog entries surface in the cabinet.
  await seedAchievement(userId, fixture.competitionId, 'form-reader', 'SILVER')
  await seedAchievement(userId, fixture.competitionId, 'champions-path', 'GOLD')
  await seedAchievement(userId, fixture.competitionId, 'group-guru', 'BRONZE')

  // The dev server compiles this route on first hit; that cold compile can abort
  // the very first navigation (ERR_ABORTED). Retry until it serves.
  await expect(async () => {
    await page.goto(`/${fixture.slug}/users/${userId}`)
  }).toPass({ timeout: 30_000 })

  // The cabinet renders the trophy and the earned badges (renames + new catalog).
  await expect(page.getByText('Grand Champion')).toBeVisible()
  await expect(page.getByText('The Hunt Is On')).toBeVisible() // key: first-blood
  await expect(page.getByText('First Blood', { exact: true })).toBeVisible() // key: opening-act
  await expect(page.getByText('Grand Finale')).toBeVisible()
  await expect(page.getByText('Wooden Spoon')).toBeVisible()
  await expect(page.getByText('Form Reader')).toBeVisible()
  await expect(page.getByText("Champion's Path")).toBeVisible()
  await expect(page.getByText('Group Guru')).toBeVisible()

  // The new badge carries its unlock criteria too (stylized-tooltip data on the tile).
  await page.getByText("Champion's Path").hover()
  await expect(
    page.getByText("Call the champion's whole run: every match's outcome for gold, every one exact for diamond."),
  ).toBeVisible()

  // Every tile carries its unlock criteria for a stylized tooltip (rendered as the
  // PrimeVue directive's aria data on the tile). Hover the opener badge and assert
  // the criteria copy shows.
  await page.getByText('First Blood', { exact: true }).hover()
  await expect(
    page.getByText("Call the exact scoreline of the tournament's opening match."),
  ).toBeVisible()

  // Owner sees the empty-showcase prompt and, once hydrated, the edit control.
  await expect(page.getByText('Show off up to 3 of your achievements here.')).toBeVisible()

  // A fresh account's one-time league onboarding modal can float in over the
  // page (no close button / no Escape) and intercept clicks; the sign-up dismiss
  // can race a straight-after navigation, so clear it here before interacting.
  await dismissOnboarding(page)

  const arrange = page.getByRole('button', { name: 'Edit showcase' })
  await expect(arrange).toBeVisible()
  await arrange.click()

  // Pin the first earned achievement and save.
  const pin = page.getByRole('button', { name: 'Add to showcase' }).first()
  await expect(pin).toBeVisible()
  await pin.click()
  await page.getByRole('button', { name: 'Done' }).click()

  // The pin persisted to the showcase.
  await expect.poll(() => getShowcasePins(userId, fixture.competitionId), { timeout: 8_000 }).toHaveLength(1)
})

test('opening My achievements from another page scrolls to the cabinet, not the matches', async ({ page }) => {
  const user = freshUser()
  await signUp(page, user)
  const userId = await getUserIdByEmail(user.email)

  // A played, scored pick gives the profile a "now" boundary that the default
  // jump-to-now would scroll to; a badge gives the cabinet content. The bug: an
  // in-app nav to the profile with #cabinet let jump-to-now steal the scroll.
  await scoreMatch(fixture.matchId, 2, 1)
  await seedScoredPrediction(userId, fixture.matchId, 2, 1, 3, 'EXACT')
  await seedAchievement(userId, fixture.competitionId, 'first-blood', 'BRONZE')

  await expect(async () => {
    await page.goto(`/${fixture.slug}`)
  }).toPass({ timeout: 30_000 })
  await dismissOnboarding(page)

  // Open the user menu and follow "My achievements" - an in-app (SPA) nav to the
  // profile page with the #cabinet hash, freshly mounted.
  await page.locator('[data-test=user-menu]').click()
  await page.getByRole('link', { name: 'My achievements' }).click()

  await expect(page).toHaveURL(/#cabinet$/)
  // The cabinet scrolls into view; jump-to-now no longer wins the one-shot. Gate on
  // interactivity since the scroll fires post-hydration.
  await expect(async () => {
    await expect(page.locator('#cabinet')).toBeInViewport()
  }).toPass({ timeout: 10_000 })
})
