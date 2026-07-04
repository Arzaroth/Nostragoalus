import { randomBytes, randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { expect, test } from '@playwright/test'
import { freshUser, signUp, typeInto } from './helpers/auth'

// The send path needs no recipient private key: user A generates the thread key,
// seals it to B's public key, and encrypts locally - so we can seed B as a bare
// user with a chat_identity (a random 32-byte public key; libsodium seal does not
// validate the point, and this spec never decrypts as B). A shares no league with
// B, so B is found via the global discoverable-stranger search by name.
const CONNECTION =
  process.env.E2E_DATABASE_URL ?? 'postgres://nostragoalus:nostragoalus@localhost:5432/nostragoalus'
let pool: Pool | null = null
function db(): Pool {
  if (!pool) pool = new Pool({ connectionString: CONNECTION })
  return pool
}

const tag = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`
const B_NAME = `Bee ${tag}`
const B_EMAIL = `e2e-bee-${tag}@example.com`
let bId: string

test.beforeAll(async () => {
  bId = randomUUID()
  await db().query(`insert into "user" (id, name, email, email_verified) values ($1, $2, $3, true)`, [
    bId,
    B_NAME,
    B_EMAIL,
  ])
  // A valid-length chat public key: 32 random bytes in url-safe, no-padding base64
  // (the exact variant app/utils/e2ee.ts encodes/decodes public keys with, so the
  // client can seal the thread key to it). dm_discoverable defaults true, so B is
  // searchable by name.
  await db().query(`insert into chat_identity (user_id, public_key) values ($1, $2)`, [
    bId,
    randomBytes(32).toString('base64url'),
  ])
})

test.afterAll(async () => {
  // Deleting B cascades its chat_identity, the dm_thread and its messages.
  await db()
    .query(`delete from "user" where id = $1`, [bId])
    .catch(() => {})
  await pool?.end()
  pool = null
})

test('a signed-in user opens the DM dock, finds someone, and sends them a message', async ({ page }) => {
  const userA = freshUser()
  await signUp(page, userA)

  // The dock lives in the default layout; an SSR-rendered bubble can be clicked
  // before hydration wires @click, so retry opening until the panel shows.
  const openBubble = page.getByRole('button', { name: 'Open direct messages' })
  const pencil = page.getByRole('button', { name: 'New message' })
  await expect(async () => {
    await openBubble.click({ timeout: 2_000 })
    await expect(pencil).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })

  // Empty inbox for a brand-new account.
  await expect(page.getByText('No conversations yet.')).toBeVisible()

  // New-message search: type B's name and pick them from the results.
  await pencil.click()
  await typeInto(page.getByPlaceholder('Search by name'), B_NAME)
  const result = page.getByRole('button', { name: new RegExp(B_NAME) })
  await expect(result).toBeVisible({ timeout: 15_000 })
  await result.click()

  // Picking opens (auto-enrolls A's identity, creates the thread) the conversation.
  const composer = page.getByPlaceholder('Message')
  await expect(composer).toBeVisible({ timeout: 15_000 })
  const body = `hello ${tag}`
  await typeInto(composer, body)
  await composer.press('Enter')

  // The sent message bubble appears in the thread (decrypted client-side).
  await expect(page.getByText(body)).toBeVisible({ timeout: 15_000 })
})
