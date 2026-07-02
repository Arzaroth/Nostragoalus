import { test, expect, request } from '@playwright/test'
import { ADMIN, freshUser, signUp, typeInto } from './helpers/auth'
import { closeDb } from './helpers/db'

// Roadmap v2 main path through the real UI: a signed-in user posts a suggestion
// (which lands "under review"), upvotes it, and an admin blessing it clears the
// under-review flag. The user path is driven in the browser; the admin bless
// uses the admin API (the same sign-in pattern the other specs use).
const APP = process.env.E2E_APP_URL ?? 'http://localhost:3000'

test.afterAll(async () => {
  await closeDb()
})

test('suggest -> under review -> upvote -> admin approve clears the flag', async ({ page }) => {
  const user = freshUser('roadmap')
  await signUp(page, user) // verified, signed in, onboarding dismissed

  await page.goto('/roadmap')
  await page.waitForLoadState('networkidle')

  const title = `E2E dark mode ${Date.now().toString(36)}`

  // The suggest form only renders for a signed-in viewer.
  const titleInput = page.getByPlaceholder(/idea in a few words/i)
  await expect(titleInput).toBeVisible()
  await typeInto(titleInput, title)
  await page.getByRole('button', { name: 'Suggest', exact: true }).click()

  // The suggestion appears, flagged "under review".
  const row = page.locator('div.flex.items-start', { hasText: title })
  await expect(row).toBeVisible()
  await expect(row.getByText('Under review')).toBeVisible()

  // Upvote it. The control is SSR-rendered, so gate the first click on
  // interactivity: retry until the handler is wired and the vote registers.
  const voteBtn = row.locator('button.ng-vote')
  await expect(async () => {
    await voteBtn.click()
    await expect(voteBtn).toHaveAttribute('aria-pressed', 'true')
  }).toPass({ timeout: 15_000 })
  await expect(voteBtn).toContainText('1')

  // Admin blesses the suggestion via the admin API.
  const admin = await request.newContext({ baseURL: APP })
  const signin = await admin.post('/api/auth/sign-in/email', {
    headers: { Origin: APP },
    data: { email: ADMIN.email, password: ADMIN.password },
  })
  expect(signin.ok()).toBeTruthy()
  const list = (await (await admin.get('/api/admin/roadmap')).json()) as {
    items: Array<{ id: string; title: string }>
  }
  const created = list.items.find((i) => i.title === title)
  expect(created).toBeTruthy()
  const put = await admin.put(`/api/admin/roadmap/${created!.id}`, {
    data: { moderationStatus: 'APPROVED' },
  })
  expect(put.ok()).toBeTruthy()
  await admin.dispose()

  // A fresh load no longer shows the suggestion under review (it's the only
  // SUGGESTED item in the isolated DB, so the flag is gone entirely).
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.getByText(title)).toBeVisible()
  await expect(page.getByText('Under review')).toHaveCount(0)
})
