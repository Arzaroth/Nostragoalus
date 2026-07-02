import { test, expect, request } from '@playwright/test'
import { ADMIN, freshUser, signUp } from './helpers/auth'
import {
  cleanup,
  closeDb,
  finishMatch,
  seedCompetitionWithMatch,
  seedCrowdPredictions,
  seedDefaultScoringConfig,
  type SeededFixture,
} from './helpers/db'

const APP = process.env.E2E_APP_URL ?? 'http://localhost:3000'

let fixture: SeededFixture

test.beforeAll(async () => {
  fixture = await seedCompetitionWithMatch()
  await seedDefaultScoringConfig()
  // Consensus (MODE) is 2-1; the evil twin inverts it to 1-2; the equalizer
  // always calls 1-1. The match finishes 1-1, so the equalizer (and the one
  // crowd voter who agreed) nails it while the consensus and evil twin miss.
  await seedCrowdPredictions(fixture.matchId, [[2, 1], [2, 1], [2, 1], [1, 2], [1, 1], [0, 0]])
  await finishMatch(fixture.matchId, 1, 1)

  const adminApi = await request.newContext({ baseURL: APP })
  const signin = await adminApi.post('/api/auth/sign-in/email', {
    headers: { Origin: APP },
    data: { email: ADMIN.email, password: ADMIN.password },
  })
  expect(signin.ok(), 'admin sign-in').toBeTruthy()
  const finalize = await adminApi.post('/api/admin/run-task', { data: { name: 'matches:finalize' }, timeout: 60_000 })
  expect(finalize.ok(), 'finalize run-task').toBeTruthy()
  await adminApi.dispose()
})
test.afterAll(async () => {
  await cleanup()
  await closeDb()
})

// The feature's main path through the real UI: toggle the two new bot personas
// onto the leaderboard, then confirm their contrarian picks (invert / draw) on
// the bot page.
test('bot personas: toggle ghosts, and see the inverted + draw picks', async ({ page }) => {
  await signUp(page, freshUser())
  await page.goto(`/${fixture.slug}/leaderboard`)

  // Turn each persona ghost on. An SSR toggle can be clicked before hydration
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

  // The Equalizer nailed the 1-1 draw, so its ghost row carries points.
  const equalizerRow = page.locator('a.ng-card', { hasText: 'The Equalizer' })
  const points = await equalizerRow.locator('span.text-xl.font-bold.tabular-nums').first().innerText()
  expect(Number(points), 'equalizer scored the draw').toBeGreaterThan(0)

  // Open the Equalizer's page from its ghost row: it drew the match (1-1).
  await equalizerRow.click()
  await expect(page).toHaveURL(/persona=equalizer/)
  await expect(page.getByRole('heading', { name: 'The Equalizer' })).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.tabular-nums.text-lg').first()).toHaveText(/1\s*[–-]\s*1/)

  // Switch the selector to the Evil Twin: it inverts the 2-1 consensus to 1-2.
  await expect(async () => {
    await page.getByRole('button', { name: /Evil Twin/ }).click()
    await expect(page).toHaveURL(/persona=evil-twin/, { timeout: 2_000 })
  }).toPass({ timeout: 15_000 })
  await expect(page.locator('.tabular-nums.text-lg').first()).toHaveText(/1\s*[–-]\s*2/)
})
