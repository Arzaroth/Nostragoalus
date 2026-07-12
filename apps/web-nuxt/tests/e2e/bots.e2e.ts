import { test, expect, request } from '@playwright/test'
import { ADMIN, freshUser, signUp } from './helpers/auth'
import {
  cleanup,
  closeDb,
  finishMatch,
  getUserIdByEmail,
  seedCompetitionWithMatch,
  seedCrowdPredictions,
  seedDefaultScoringConfig,
  seedUserPrediction,
  type SeededFixture,
} from './helpers/db'

const APP = process.env.E2E_APP_URL ?? 'http://localhost:3000'

let fixture: SeededFixture

test.beforeAll(async () => {
  fixture = await seedCompetitionWithMatch()
  await seedDefaultScoringConfig()
  // A crowd for the global bots (consensus mode 2-1; one draw voter). The match
  // is finished per-test, once the signed-in player has added their own pick.
  await seedCrowdPredictions(fixture.matchId, [[2, 1], [2, 1], [2, 1], [1, 2], [1, 1], [0, 0]])
})
test.afterAll(async () => {
  await cleanup()
  await closeDb()
})

// The feature's main path through the real UI: enable the crowd bots from the
// leaderboard "Bots" popover, then flip a player's profile to their Evil Twin and
// confirm it swaps that player's own pick.
test('bot personas: Bots popover ghosts + profile evil twin swaps a pick', async ({ page }) => {
  const user = freshUser()
  await signUp(page, user)

  // Seed MY own pick (2-0), then finish the match 0-2 and finalize.
  const userId = await getUserIdByEmail(user.email)
  await seedUserPrediction(userId, fixture.matchId, 2, 0)
  await finishMatch(fixture.matchId, 0, 2)

  const adminApi = await request.newContext({ baseURL: APP })
  const signin = await adminApi.post('/api/auth/sign-in/email', {
    headers: { Origin: APP },
    data: { email: ADMIN.email, password: ADMIN.password },
  })
  expect(signin.ok(), 'admin sign-in').toBeTruthy()
  const finalize = await adminApi.post('/api/admin/run-task', { data: { name: 'matches:finalize' }, timeout: 60_000 })
  expect(finalize.ok(), 'finalize run-task').toBeTruthy()
  await adminApi.dispose()

  // Leaderboard: open the Bots popover (retry - an SSR trigger can be clicked
  // before hydration) and enable both crowd bots.
  await page.goto(`/${fixture.slug}/leaderboard`)
  const botsBtn = page.getByRole('button', { name: /Bots/ }).first()
  await expect(async () => {
    await botsBtn.click()
    await expect(page.getByRole('button', { name: /Crowd Bot/ })).toBeVisible({ timeout: 1_500 })
  }).toPass({ timeout: 20_000 })
  await page.getByRole('button', { name: /Crowd Bot/ }).click()
  await page.getByRole('button', { name: /The Equalizer/ }).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('a.ng-card', { hasText: 'Crowd Bot' })).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('a.ng-card', { hasText: 'The Equalizer' })).toBeVisible({ timeout: 10_000 })

  // Profile: my picks show my 2-0; the Evil Twin toggle swaps it to 0-2.
  await page.goto(`/${fixture.slug}/users/${userId}`)
  await expect(page.locator('.tabular-nums.text-lg').first()).toHaveText(/2\s*[–-]\s*0/, { timeout: 10_000 })
  const twinBtn = page.getByRole('button', { name: /Evil Twin/ })
  await expect(async () => {
    // Only click while the twin summary is absent, so a late render is not toggled back off.
    if (!(await page.getByText(/would rank/i).isVisible().catch(() => false))) await twinBtn.click()
    await expect(page.getByText(/would rank/i)).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 20_000 })
  await expect(page.locator('.tabular-nums.text-lg').first()).toHaveText(/0\s*[–-]\s*2/)
})
