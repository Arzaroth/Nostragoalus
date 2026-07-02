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

// The feature's main path through the real UI: toggle the two new bots onto the
// leaderboard, and confirm the equalizer's draw and - the key per-user bit - that
// Your Evil Twin swaps the signed-in player's OWN pick.
test('bot personas: your evil twin swaps your pick; the equalizer draws', async ({ page }) => {
  const user = freshUser()
  await signUp(page, user)

  // Seed MY own pick (2-0) as the signed-in viewer, then finish the match 0-2:
  // my evil twin's swap (0-2) is exactly the result, so it out-scores me.
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

  await page.goto(`/${fixture.slug}/leaderboard`)

  // Turn each new bot ghost on. An SSR toggle can be clicked before hydration
  // wires it, so retry - but only click while the row is still absent, so a
  // late-appearing row is never toggled back off.
  for (const name of ['Evil Twin', 'The Equalizer']) {
    const btn = page.getByRole('button', { name: new RegExp(name) })
    const row = page.locator('a.ng-card', { hasText: name })
    await expect(async () => {
      if (!(await row.isVisible())) await btn.click()
      await expect(row).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 20_000 })
  }

  // My evil twin swapped my 2-0 into 0-2 - the actual result - so it scored.
  const twinRow = page.locator('a.ng-card', { hasText: 'Evil Twin' })
  const twinPoints = await twinRow.locator('span.text-xl.font-bold.tabular-nums').first().innerText()
  expect(Number(twinPoints), 'evil twin scored the swap').toBeGreaterThan(0)

  // Open the Equalizer from its ghost row: it drew (1-1).
  await page.locator('a.ng-card', { hasText: 'The Equalizer' }).click()
  await expect(page).toHaveURL(/persona=equalizer/)
  await expect(page.getByRole('heading', { name: 'The Equalizer' })).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.tabular-nums.text-lg').first()).toHaveText(/1\s*[–-]\s*1/)

  // Switch to Your Evil Twin: it shows MY 2-0 pick swapped to 0-2.
  await expect(async () => {
    await page.getByRole('button', { name: /Evil Twin/ }).click()
    await expect(page).toHaveURL(/persona=evil-twin/, { timeout: 2_000 })
  }).toPass({ timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Your Evil Twin' })).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.tabular-nums.text-lg').first()).toHaveText(/0\s*[–-]\s*2/)
})
