import { test, expect, request } from '@playwright/test'
import { ADMIN, dismissOnboarding, freshUser, signIn, signUp, typeInto } from './helpers/auth'
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
  const row = page.locator('.ng-roadmap-card', { hasText: title })
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
  const card = page.locator('.ng-roadmap-card', { hasText: title })
  await expect(card).toBeVisible()
  // This suggestion is no longer flagged (scoped to its own card so other
  // pending suggestions in the DB don't matter).
  await expect(card.getByText('Under review')).toHaveCount(0)
})

test('the public roadmap is a kanban board and status moves land in the right column', async ({ page }) => {
  // Seed a planned item through the admin API, then move it with the reorder
  // endpoint (the kanban drag's backend) and confirm the public board reflects it.
  const admin = await request.newContext({ baseURL: APP })
  const signin = await admin.post('/api/auth/sign-in/email', {
    headers: { Origin: APP },
    data: { email: ADMIN.email, password: ADMIN.password },
  })
  expect(signin.ok()).toBeTruthy()
  const title = `E2E board item ${Date.now().toString(36)}`
  const created = (await (await admin.post('/api/admin/roadmap', { data: { title, status: 'PLANNED' } })).json()) as {
    item: { id: string }
  }
  const id = created.item.id

  await page.goto('/roadmap')
  await page.waitForLoadState('networkidle')
  // The four board columns render, and the item sits in Planned.
  await expect(page.locator('[data-status="SUGGESTED"]')).toBeVisible()
  await expect(page.locator('[data-status="SHIPPED"]')).toBeVisible()
  await expect(page.locator('[data-status="PLANNED"]')).toContainText(title)

  const put = await admin.put('/api/admin/roadmap/reorder', { data: { status: 'IN_PROGRESS', ids: [id] } })
  expect(put.ok()).toBeTruthy()
  await admin.dispose()

  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.locator('[data-status="IN_PROGRESS"]')).toContainText(title)
  await expect(page.locator('[data-status="PLANNED"]')).not.toContainText(title)
})

test('an admin drags a card between columns on the board', async ({ page }) => {
  // Seed a planned item, then drag it to In progress through the real admin UI.
  const admin = await request.newContext({ baseURL: APP })
  await admin.post('/api/auth/sign-in/email', {
    headers: { Origin: APP },
    data: { email: ADMIN.email, password: ADMIN.password },
  })
  const title = `E2E drag ${Date.now().toString(36)}`
  await admin.post('/api/admin/roadmap', { data: { title, status: 'PLANNED' } })
  await admin.dispose()

  await signIn(page, ADMIN)
  await dismissOnboarding(page)
  await page.goto('/admin?section=roadmap')
  await page.waitForLoadState('networkidle')

  const card = page.locator('[data-status="PLANNED"] .ng-drag', { hasText: title })
  await expect(card).toBeVisible()
  const target = page.locator('[data-status="IN_PROGRESS"]')

  // Native HTML5 drag-drop; retry until hydration has wired the handlers and the
  // card actually lands in the target column.
  await expect(async () => {
    await card.dragTo(target)
    await expect(page.locator('[data-status="IN_PROGRESS"] .ng-drag', { hasText: title })).toBeVisible({
      timeout: 3000,
    })
  }).toPass({ timeout: 20_000 })

  // And it's gone from the source column.
  await expect(page.locator('[data-status="PLANNED"] .ng-drag', { hasText: title })).toHaveCount(0)
})
