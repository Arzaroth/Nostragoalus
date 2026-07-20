import { randomBytes, randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { expect, test } from '@playwright/test'
import { dismissOnboarding, freshUser, signUp, typeInto } from './helpers/auth'

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
  // (the exact variant app/utils/e2ee.ts encodes/decodes public keys with - its
  // libsodium from_base64 needs URLSAFE_NO_PADDING - so the client can seal the
  // thread key to it). dm_discoverable defaults true, so B is searchable by name.
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

test('a signed-in user opens the messaging dock in Direct mode, finds someone, and sends them a message', async ({
  page,
}) => {
  const userA = freshUser()
  await signUp(page, userA)

  // The messaging dock (league chat + DMs, one surface) lives in the default
  // layout; its bubble is bottom-RIGHT. An SSR-rendered bubble can be clicked
  // before hydration wires @click, so retry opening until the Direct-mode inbox
  // (its "New message" pencil) shows. A brand-new account has no league selected,
  // so the dock opens straight into Direct mode - the League|Direct toggle only
  // appears once a league is in reach; if one is, flip to Direct via its
  // send/paper-plane button.
  const openBubble = page.getByRole('button', { name: 'Open league chat' })
  const pencil = page.getByRole('button', { name: 'New message' })
  await expect(async () => {
    await openBubble.click({ timeout: 2_000 })
    const directToggle = page.getByRole('button', { name: 'Messages', exact: true })
    if (await directToggle.isVisible().catch(() => false)) await directToggle.click()
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

  // Picking auto-enrolls A's identity, creates the thread, and opens it in a
  // ChatPanel driven in DM mode (full chat parity), whose composer is the shared
  // chat composer.
  const composer = page.getByPlaceholder('Write a message')
  await expect(composer).toBeVisible({ timeout: 15_000 })
  const body = `hello ${tag}`
  await typeInto(composer, body)
  // Hold the POST so the in-flight state is observable: the message must show up
  // straight away, marked as sending, instead of vanishing until the server answers.
  // The hold is generous - a cold runner spends seconds on key setup and the first
  // encrypt before the request is even issued.
  let releasePost = () => {}
  const held = new Promise<void>((r) => (releasePost = r))
  await page.route('**/api/dm/*/messages', async (route) => {
    if (route.request().method() === 'POST') await held
    await route.continue()
  })
  await composer.press('Enter')
  await expect(page.getByTestId('chat-sending')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(body).first()).toBeVisible()

  // Once it lands the bubble is the real message, no sending marker left.
  releasePost()
  await expect(page.getByTestId('chat-sending')).toBeHidden({ timeout: 15_000 })
  await page.unroute('**/api/dm/*/messages')
  await expect(page.getByText(body).first()).toBeVisible({ timeout: 15_000 })
})

test('DM notifications collapse into one bell entry that opens the dock instead of the home page', async ({
  page,
}) => {
  const userA = freshUser()
  await signUp(page, userA)
  const { rows } = await db().query<{ id: string }>(`select id from "user" where email = $1`, [userA.email])
  const aId = rows[0]!.id

  // Seed two DM_MESSAGE notifications from B in two different threads (as notifyDm
  // would, one row per thread). The bell must show ONE grouped entry, and because
  // it spans two threads clicking it opens the Direct inbox in place - never the
  // home page. Seeding directly avoids standing up B's client-side crypto session.
  for (const threadId of [randomUUID(), randomUUID()]) {
    await db().query(
      `insert into user_notification (id, user_id, type, data, dedupe_key)
       values ($1, $2, 'DM_MESSAGE', $3, $4)`,
      [
        randomUUID(),
        aId,
        JSON.stringify({ type: 'DM_MESSAGE', threadId, senderId: bId, senderName: B_NAME }),
        `dm-thread:${threadId}`,
      ],
    )
  }

  // Reload so the bell's feed query refetches and picks up the seeded rows, then
  // clear the one-time league prompt again (a modal mask that would otherwise
  // intercept the clicks below) before touching the header.
  await page.reload()
  await page.waitForLoadState('networkidle')
  await dismissOnboarding(page)
  // If the prompt re-showed (slow dismissal write), its hand-off auto-starts the
  // welcome tour, which force-navigates to /matches; the no-navigation assertion
  // below needs the bell flow to start from the home page.
  if (new URL(page.url()).pathname !== '/') {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  }

  // Open the bell (retry through hydration) and assert the two threads collapsed to
  // a single grouped line rather than two separate rows.
  const bell = page.getByRole('button', { name: 'Notifications' })
  const grouped = page.getByText('2 people sent you messages.')
  await expect(async () => {
    await bell.click({ timeout: 2_000 })
    await expect(grouped).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })

  // Clicking the grouped entry opens the messaging dock's Direct inbox in place; the
  // URL stays on the home page path (no navigation, no full reload). Playwright
  // retries the click through the brief markAllRead refetch re-render.
  await grouped.click({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'New message' })).toBeVisible({ timeout: 15_000 })
  expect(new URL(page.url()).pathname).toBe('/')
})
