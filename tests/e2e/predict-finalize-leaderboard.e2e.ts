import { test, expect, request } from '@playwright/test'
import { ADMIN, freshUser, signUp } from './helpers/auth'
import {
  cleanup,
  closeDb,
  finishMatch,
  getMatchPrediction,
  getPredictionScore,
  seedCompetitionWithMatch,
  type SeededFixture,
} from './helpers/db'

const APP = process.env.E2E_APP_URL ?? 'http://localhost:3000'

let fixture: SeededFixture

test.beforeAll(async () => {
  fixture = await seedCompetitionWithMatch()
})
test.afterAll(async () => {
  await cleanup()
  await closeDb()
})

// The core money path through the real UI: a user predicts a fixture, the match
// finishes, an admin runs finalize, and the leaderboard reflects the scored pick.
test('predict -> finalize -> leaderboard', async ({ page }) => {
  const user = freshUser()
  await signUp(page, user)

  // Predict the seeded match: an exact 2-1.
  await page.goto(`/${fixture.slug}/matches`)
  await page.waitForLoadState('networkidle')
  const card = page.locator(`#match-${fixture.matchId}`)
  await expect(card).toBeVisible()
  // PrimeVue InputNumber ignores .fill() for its model, but the list animates so a
  // bare .click() won't stabilise. fill('') focuses + clears (lenient on
  // stability), then real keystrokes set the value.
  const scores = card.locator('input.ng-score-input')
  await scores.nth(0).fill('')
  await scores.nth(0).pressSequentially('2')
  await scores.nth(1).fill('')
  await scores.nth(1).pressSequentially('1')
  await scores.nth(1).press('Enter')
  // The check icon confirms the pick was saved.
  await expect(card.locator('i.pi.pi-check')).toBeVisible({ timeout: 10_000 })
  // Assert the pick actually persisted as 2-1 (catches a silent input-model miss);
  // poll, since the save PUT is async.
  await expect.poll(() => getMatchPrediction(fixture.matchId), { timeout: 8_000 }).toEqual({ home: 2, away: 1 })

  // The match finishes 2-1 (an exact hit), then an admin runs finalize.
  await finishMatch(fixture.matchId, 2, 1)
  const adminApi = await request.newContext({ baseURL: APP })
  const signin = await adminApi.post('/api/auth/sign-in/email', {
    headers: { Origin: APP },
    data: { email: ADMIN.email, password: ADMIN.password },
  })
  expect(signin.ok(), 'admin sign-in').toBeTruthy()
  // Generous timeout: against the HMR dev server this route compiles on first hit.
  const finalize = await adminApi.post('/api/admin/run-task', { data: { name: 'matches:finalize' }, timeout: 60_000 })
  expect(finalize.ok(), 'finalize run-task').toBeTruthy()
  await adminApi.dispose()

  // Finalize should have locked + scored the exact pick.
  expect(await getPredictionScore(fixture.matchId), 'prediction scored by finalize').toMatchObject({ baseTier: 'EXACT' })

  // The leaderboard now ranks the predictor with the points the exact pick scored.
  await page.goto(`/${fixture.slug}/leaderboard`)
  const row = page.locator('a.ng-card', { hasText: user.name! })
  await expect(row).toBeVisible({ timeout: 10_000 })
  const points = await row.locator('span.text-xl.font-bold.tabular-nums').first().innerText()
  expect(Number(points), `leaderboard points for ${user.name}`).toBeGreaterThan(0)
})
