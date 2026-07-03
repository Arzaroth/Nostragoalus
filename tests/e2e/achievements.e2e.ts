import { expect, test } from '@playwright/test'
import { dismissOnboarding, freshUser, signUp } from './helpers/auth'
import {
  cleanup,
  closeDb,
  getShowcasePins,
  getUserIdByEmail,
  seedAchievement,
  seedCompetitionWithMatch,
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

  // One trophy (overall winner) + one badge for the signed-in user.
  await seedTrophy(fixture.competitionId, userId, 'OVERALL', 42)
  await seedAchievement(userId, fixture.competitionId, 'first-blood', 'BRONZE')

  // The dev server compiles this route on first hit; that cold compile can abort
  // the very first navigation (ERR_ABORTED). Retry until it serves.
  await expect(async () => {
    await page.goto(`/${fixture.slug}/users/${userId}`)
  }).toPass({ timeout: 30_000 })

  // The cabinet renders the trophy and the earned badge.
  await expect(page.getByText('Grand Champion')).toBeVisible()
  await expect(page.getByText('First Blood')).toBeVisible()

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
