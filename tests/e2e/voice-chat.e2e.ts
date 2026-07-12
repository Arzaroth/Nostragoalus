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

  // A places the call: the header Call button acquires the (fake) mic, joins the
  // room and rings B, whose app-wide overlay pops the incoming call. The ring is a
  // one-shot; if B's voice socket wasn't connected yet the ring is lost, so this is
  // self-healing - on a miss it hangs A up (back to idle, the Call button returns)
  // and re-rings, rather than flaking.
  const callBtn = pageA.getByRole('button', { name: 'Call', exact: true })
  const accept = pageB.getByRole('button', { name: 'Accept' })
  await expect(callBtn).toBeVisible({ timeout: 15_000 })
  await expect(async () => {
    if (await callBtn.isVisible().catch(() => false)) await callBtn.click({ timeout: 2_000 })
    if (!(await accept.isVisible({ timeout: 4_000 }).catch(() => false))) {
      const hangup = pageA.getByRole('button', { name: 'Hang up' })
      if (await hangup.isVisible().catch(() => false)) await hangup.click()
      throw new Error('callee did not ring yet; retrying')
    }
  }).toPass({ timeout: 40_000 })

  // B answers.
  await accept.click()

  // Both peers join the room, so each shows the in-call bar (the hang-up control).
  // This is driven by signaling (roster), independent of ICE completing.
  await expect(pageA.getByRole('button', { name: 'Hang up' })).toBeVisible({ timeout: 15_000 })
  await expect(pageB.getByRole('button', { name: 'Hang up' })).toBeVisible({ timeout: 15_000 })

  // A hangs up; the bar clears.
  await pageA.getByRole('button', { name: 'Hang up' }).click()
  await expect(pageA.getByRole('button', { name: 'Hang up' })).toBeHidden({ timeout: 15_000 })

  await ctxA.close()
  await ctxB.close()
})
