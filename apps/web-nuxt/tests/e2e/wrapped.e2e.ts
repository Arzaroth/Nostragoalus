import { expect, test } from '@playwright/test'
import { freshUser, signUp } from './helpers/auth'
import {
  cleanup,
  closeDb,
  getUserIdByEmail,
  seedCompetitionWithMatch,
  seedDecidedFinal,
  seedFinishedExactPrediction,
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

test('the wrapped deck unlocks post-final and steps through to the shareable summary', async ({ page }) => {
  const user = freshUser()
  await signUp(page, user)
  const userId = await getUserIdByEmail(user.email)

  // A scored EXACT pick + a trophy give the recap real numbers; the decided
  // final opens the gate.
  await seedFinishedExactPrediction(userId, fixture.matchId, 3)
  await seedTrophy(fixture.competitionId, userId, 'OVERALL', 3)
  await seedDecidedFinal(fixture.competitionId)

  // Cold dev-server compile can abort the very first navigation; retry.
  await expect(async () => {
    await page.goto(`/${fixture.slug}/wrapped`)
  }).toPass({ timeout: 30_000 })

  // Intro slide greets the user by name.
  const deck = page.locator('[data-test="wrapped-deck"]')
  await expect(deck).toBeVisible()
  await expect(page.locator('[data-test="wrapped-slide-intro"]')).toContainText(user.name)

  // An SSR-rendered control can be clicked before hydration wires it: retry the
  // first tap until the slide actually advances.
  const next = page.locator('[data-test="wrapped-next"]')
  await expect(async () => {
    await next.click()
    await expect(page.locator('[data-test="wrapped-slide-totals"]')).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
  await expect(page.locator('[data-test="wrapped-slide-totals"]')).toContainText('3')

  // Tap through the rest of the deck to the summary (bounded: the deck is
  // at most 12 slides).
  for (let i = 0; i < 12; i++) {
    if (await page.locator('[data-test="wrapped-slide-summary"]').isVisible()) break
    await next.click()
  }
  await expect(page.locator('[data-test="wrapped-slide-summary"]')).toBeVisible()
  await expect(page.locator('[data-test="wrapped-download"]')).toBeVisible()
  await expect(page.locator('[data-test="wrapped-copy"]')).toBeVisible()

  // The share pipeline end to end: mint a token with the session, then the
  // public OG route renders a real PNG for it.
  const mint = await page.request.post('/api/share/wrapped-mint', { data: { competition: fixture.slug } })
  expect(mint.ok()).toBeTruthy()
  const { imageUrl } = (await mint.json()) as { imageUrl: string }
  const img = await page.request.get(imageUrl)
  expect(img.ok()).toBeTruthy()
  expect(img.headers()['content-type']).toContain('image/png')
})

test('the leaderboard banner links into the wrapped once the final is decided', async ({ page }) => {
  const user = freshUser()
  await signUp(page, user)

  await expect(async () => {
    await page.goto(`/${fixture.slug}/leaderboard`)
  }).toPass({ timeout: 30_000 })

  const banner = page.locator('[data-test="wrapped-banner"]')
  await expect(banner).toBeVisible()
  await expect(async () => {
    await banner.click()
    await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/wrapped`), { timeout: 2_000 })
  }).toPass({ timeout: 15_000 })
  await expect(page.locator('[data-test="wrapped-deck"]')).toBeVisible()
})
