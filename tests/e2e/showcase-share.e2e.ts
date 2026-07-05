import { expect, test } from '@playwright/test'
import { freshUser, signUp } from './helpers/auth'
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

test('the trophy cabinet shows a progress bar toward the next badge tier', async ({ page }) => {
  const user = freshUser()
  await signUp(page, user)
  const userId = await getUserIdByEmail(user.email)
  // One scored EXACT pick: 1 toward Sharpshooter (bronze at 5).
  await seedFinishedExactPrediction(userId, fixture.matchId)

  await expect(async () => {
    await page.goto(`/${fixture.slug}/users/${userId}`)
  }).toPass({ timeout: 30_000 })

  // The locked Sharpshooter badge draws its "1 / 5" progress bar.
  await expect(page.locator('#cabinet')).toContainText('1 / 5', { timeout: 15_000 })
})

test('sharing your profile mints a link that renders a public card', async ({ page }) => {
  const user = freshUser()
  await signUp(page, user)
  const userId = await getUserIdByEmail(user.email)
  await seedFinishedExactPrediction(userId, fixture.matchId)

  await expect(async () => {
    await page.goto(`/${fixture.slug}/users/${userId}`)
  }).toPass({ timeout: 30_000 })

  // The owner sees a Share button on their own profile.
  await expect(page.locator('[data-test="share-profile"]')).toBeVisible()

  // The share pipeline end to end: mint with the session, then the public OG
  // route renders a real PNG and the /p/ landing resolves without a login.
  const mint = await page.request.post('/api/share/profile-mint', { data: { competition: fixture.slug } })
  expect(mint.ok()).toBeTruthy()
  const { imageUrl, url } = (await mint.json()) as { imageUrl: string; url: string }
  const img = await page.request.get(imageUrl)
  expect(img.ok()).toBeTruthy()
  expect(img.headers()['content-type']).toContain('image/png')
  const landing = await page.request.get(url)
  expect(landing.ok()).toBeTruthy()
})

test('sharing your analytics mints a link that renders a public card', async ({ page }) => {
  const user = freshUser()
  await signUp(page, user)
  const userId = await getUserIdByEmail(user.email)
  await seedFinishedExactPrediction(userId, fixture.matchId)

  await expect(async () => {
    await page.goto(`/${fixture.slug}/analytics`)
  }).toPass({ timeout: 30_000 })

  // With a scored pick there is a report, and its Share button appears.
  await expect(page.locator('[data-test="analytics-report"]')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('[data-test="share-analytics"]')).toBeVisible()

  const mint = await page.request.post('/api/share/analytics-mint', { data: { competition: fixture.slug } })
  expect(mint.ok()).toBeTruthy()
  const { imageUrl } = (await mint.json()) as { imageUrl: string }
  const img = await page.request.get(imageUrl)
  expect(img.ok()).toBeTruthy()
  expect(img.headers()['content-type']).toContain('image/png')
})
