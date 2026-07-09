import { randomBytes, randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { expect, test } from '@playwright/test'
import { freshUser, signUp, typeInto } from './helpers/auth'

// Chat identity recovery drives entirely off the shared E2EE identity, so we exercise
// it through a DM panel (verify + recovery render there). We seed a bare recipient B
// (a chat_identity with a random 32-byte pubkey) so user A can open a thread and land
// in a ready DM ChatPanel - the send path never needs B's private key.
const CONNECTION =
  process.env.E2E_DATABASE_URL ?? 'postgres://nostragoalus:nostragoalus@localhost:5432/nostragoalus'
let pool: Pool | null = null
function db(): Pool {
  if (!pool) pool = new Pool({ connectionString: CONNECTION })
  return pool
}

const tag = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`
const B_NAME = `Ree ${tag}`
const B_EMAIL = `e2e-ree-${tag}@example.com`
let bId: string

test.beforeAll(async () => {
  bId = randomUUID()
  await db().query(`insert into "user" (id, name, email, email_verified) values ($1, $2, $3, true)`, [
    bId,
    B_NAME,
    B_EMAIL,
  ])
  await db().query(`insert into chat_identity (user_id, public_key) values ($1, $2)`, [
    bId,
    randomBytes(32).toString('base64url'),
  ])
})

test.afterAll(async () => {
  await db()
    .query(`delete from "user" where id = $1`, [bId])
    .catch(() => {})
  await pool?.end()
  pool = null
})

test('a user sets up a chat recovery code, then regenerates it from the danger zone', async ({ page }) => {
  const userA = freshUser()
  await signUp(page, userA)

  // Open the messaging dock in Direct mode and start a thread with B - this
  // auto-enrolls A's identity and lands in a ready DM ChatPanel.
  const openBubble = page.getByRole('button', { name: 'Open league chat' })
  const pencil = page.getByRole('button', { name: 'New message' })
  await expect(async () => {
    await openBubble.click({ timeout: 2_000 })
    const directToggle = page.getByRole('button', { name: 'Messages', exact: true })
    if (await directToggle.isVisible().catch(() => false)) await directToggle.click()
    await expect(pencil).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await pencil.click()
  await typeInto(page.getByPlaceholder('Search by name'), B_NAME)
  const result = page.getByRole('button', { name: new RegExp(B_NAME) })
  await expect(result).toBeVisible({ timeout: 15_000 })
  await result.click()
  await expect(page.getByPlaceholder('Write a message')).toBeVisible({ timeout: 15_000 })

  // The overflow menu (SSR-rendered, so retry through hydration). Before a code is
  // saved it offers "Set up a recovery code".
  const menu = page.getByRole('button', { name: 'More options' })
  const setup = page.getByRole('button', { name: 'Set up a recovery code' })
  await expect(async () => {
    await menu.click({ timeout: 2_000 })
    await expect(setup).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await setup.click()

  // The code is shown once. Capture it, then dismiss.
  const recoveryDialog = page.getByRole('dialog', { name: 'Save your recovery code' })
  await expect(recoveryDialog).toBeVisible({ timeout: 15_000 })
  const firstCode = (await recoveryDialog.locator('code').innerText()).trim()
  expect(firstCode.length).toBeGreaterThan(0)
  await recoveryDialog.getByRole('button', { name: "I've saved it" }).click()

  // With a code saved, the danger zone now offers Regenerate (and Reset). Regenerate
  // is behind a confirm that warns the old code stops working.
  await menu.click()
  await expect(page.getByRole('button', { name: 'Reset chat identity' })).toBeVisible()
  await page.getByRole('button', { name: 'Regenerate recovery code' }).click()
  await expect(page.getByText('Your current recovery code stops working')).toBeVisible()
  await page.getByRole('button', { name: 'Regenerate', exact: true }).click()

  // A fresh code is shown once more, and it differs from the first.
  await expect(recoveryDialog).toBeVisible({ timeout: 15_000 })
  const secondCode = (await recoveryDialog.locator('code').innerText()).trim()
  expect(secondCode.length).toBeGreaterThan(0)
  expect(secondCode).not.toBe(firstCode)
})
