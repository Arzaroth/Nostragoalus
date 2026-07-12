import { randomBytes } from 'node:crypto'
import { Pool } from 'pg'
import { expect, test } from '@playwright/test'
import { freshUser, signUp, typeInto } from './helpers/auth'

// Voice chat rides WebRTC. In the isolated stack there is no coturn, but two
// browsers on the same host connect over loopback host candidates (STUN not even
// needed), so the call path works end to end. Fake media so getUserMedia resolves
// headless without a real mic, and a fake UI so no permission prompt blocks it.
test.use({
  launchOptions: {
    args: [
      '--host-resolver-rules=MAP keycloak 127.0.0.1',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
})

const CONNECTION = process.env.E2E_DATABASE_URL ?? 'postgres://nostragoalus:nostragoalus@localhost:5432/nostragoalus'
let pool: Pool | null = null
function db(): Pool {
  if (!pool) pool = new Pool({ connectionString: CONNECTION })
  return pool
}
test.afterAll(async () => {
  await pool?.end()
  pool = null
})

// Open the messaging dock in Direct mode and wait for the "New message" pencil.
async function openDirect(page: import('@playwright/test').Page): Promise<void> {
  const openBubble = page.getByRole('button', { name: 'Open league chat' })
  const pencil = page.getByRole('button', { name: 'New message' })
  await expect(async () => {
    await openBubble.click({ timeout: 2_000 })
    const directToggle = page.getByRole('button', { name: 'Messages', exact: true })
    if (await directToggle.isVisible().catch(() => false)) await directToggle.click()
    await expect(pencil).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
}

test('a DM voice call: caller rings, callee answers, both land in the call', async ({ browser }) => {
  const userA = freshUser('voice-a')
  const userB = freshUser('voice-b')

  const ctxA = await browser.newContext({ permissions: ['microphone'] })
  const ctxB = await browser.newContext({ permissions: ['microphone'] })
  const pageA = await ctxA.newPage()
  const pageB = await ctxB.newPage()

  await signUp(pageA, userA)
  await signUp(pageB, userB)

  // Seed B's chat identity so A can seal the DM thread key to it (B's real client
  // never decrypts here - the voice ring is independent of chat crypto). B stays a
  // real, signed-in client so its voice socket receives the ring and can answer.
  const { rows } = await db().query<{ id: string }>(`select id from "user" where email = $1`, [userB.email])
  const bId = rows[0]!.id
  await db().query(`insert into chat_identity (user_id, public_key) values ($1, $2) on conflict do nothing`, [
    bId,
    randomBytes(32).toString('base64url'),
  ])

  // A opens a DM with B (found by name via the discoverable-stranger search).
  await openDirect(pageA)
  await pageA.getByRole('button', { name: 'New message' }).click()
  await typeInto(pageA.getByPlaceholder('Search by name'), userB.name)
  const result = pageA.getByRole('button', { name: new RegExp(userB.name) })
  await expect(result).toBeVisible({ timeout: 15_000 })
  await result.click()
  await expect(pageA.getByPlaceholder('Write a message')).toBeVisible({ timeout: 15_000 })

  // B's page has been loaded and interactive since sign-up, so its always-mounted
  // voice socket is connected well before A (which still has to open the dock,
  // search and open the thread) places the call - settle it to be sure.
  await pageB.waitForLoadState('networkidle')

  // A places the call: the header Call button acquires the (fake) mic, joins the
  // room and rings B. A's outgoing bar shows "Ringing".
  const callBtn = pageA.getByRole('button', { name: 'Call', exact: true })
  await expect(callBtn).toBeVisible({ timeout: 15_000 })
  await expect(async () => {
    await callBtn.click({ timeout: 2_000 })
    await expect(pageA.getByText('Ringing')).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 20_000 })

  // B's app-wide ring overlay pops the incoming call. B answers.
  const accept = pageB.getByRole('button', { name: 'Accept' })
  await expect(accept).toBeVisible({ timeout: 15_000 })
  await accept.click()

  // Both peers join the room, so each shows the in-call bar (the hang-up control).
  // This is driven by signaling (roster), independent of ICE completing.
  await expect(pageA.getByRole('button', { name: 'Hang up' })).toBeVisible({ timeout: 15_000 })
  await expect(pageB.getByRole('button', { name: 'Hang up' })).toBeVisible({ timeout: 15_000 })

  // The in-call bar names the other participant (names ride the roster frames -
  // B has no chat open, so this can only come from the voice roster).
  await expect(pageB.getByText(userA.name)).toBeVisible({ timeout: 15_000 })

  // The audio settings dialog opens with the device pickers and noise toggle.
  await pageB.getByRole('button', { name: 'Audio settings' }).click()
  await expect(pageB.getByText('Noise suppression')).toBeVisible({ timeout: 10_000 })
  await pageB.keyboard.press('Escape')
  await expect(pageB.getByText('Noise suppression')).toBeHidden({ timeout: 10_000 })

  // A hangs up; BOTH bars clear - one side leaving ends the DM call for the other.
  await pageA.getByRole('button', { name: 'Hang up' }).click()
  await expect(pageA.getByRole('button', { name: 'Hang up' })).toBeHidden({ timeout: 15_000 })
  await expect(pageB.getByRole('button', { name: 'Hang up' })).toBeHidden({ timeout: 15_000 })

  // The ended call leaves a system line in A's open thread.
  await expect(pageA.getByText(`Call by ${userA.name}`)).toBeVisible({ timeout: 15_000 })

  await ctxA.close()
  await ctxB.close()
})
