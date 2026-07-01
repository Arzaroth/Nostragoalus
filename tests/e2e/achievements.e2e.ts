import { expect, test } from '@playwright/test'
import { freshUser, signUp } from './helpers/auth'
import {
  cleanup,
  closeDb,
  getFridgePins,
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

test('the trophy cabinet shows earned items and the owner can pin one to the fridge', async ({ page }) => {
  const user = freshUser()
  await signUp(page, user)
  const userId = await getUserIdByEmail(user.email)

  // One trophy (overall winner) + one badge for the signed-in user.
  await seedTrophy(fixture.competitionId, userId, 'OVERALL', 42)
  await seedAchievement(userId, fixture.competitionId, 'first-blood', 'BRONZE')

  await page.goto(`/${fixture.slug}/users/${userId}`)

  // The cabinet renders the trophy and the earned badge.
  await expect(page.getByText('Grand Champion')).toBeVisible()
  await expect(page.getByText('First Blood')).toBeVisible()

  // Owner sees the empty-fridge prompt and, once hydrated, the arrange control.
  await expect(page.getByText('Pin your proudest trophies and badges here.')).toBeVisible()
  const arrange = page.getByRole('button', { name: 'Arrange fridge' })
  await expect(arrange).toBeVisible()
  await arrange.click()

  // Pin the first earned item and save.
  const pin = page.getByRole('button', { name: 'Pin to fridge' }).first()
  await expect(pin).toBeVisible()
  await pin.click()
  await page.getByRole('button', { name: 'Done' }).click()

  // The pin persisted to the fridge.
  await expect.poll(() => getFridgePins(userId, fixture.competitionId), { timeout: 8_000 }).toHaveLength(1)
})
