import { expect, test } from '@playwright/test'
import { dismissOnboarding, freshUser, signUp } from './helpers/auth'
import {
  E2E_SLUG,
  cleanup,
  closeDb,
  getUserIdByEmail,
  seedChatLeague,
  seedCompetitionWithMatch,
} from './helpers/db'

// Two chat-enabled leagues on one competition, so the league filter at the top of
// the page has somewhere to move to while the pinned chat stays put.
const ALPHA = 'E2E Alpha'
const BETA = 'E2E Beta'

test.afterAll(async () => {
  await cleanup()
  await closeDb()
})

test('pinning the chat keeps it on one league while the rankings filter moves', async ({ page }) => {
  const { competitionId } = await seedCompetitionWithMatch()
  const user = freshUser()
  await signUp(page, user)
  await dismissOnboarding(page)
  const userId = await getUserIdByEmail(user.email)
  await seedChatLeague(competitionId, userId, ALPHA)
  await seedChatLeague(competitionId, userId, BETA)

  await page.goto(`/${E2E_SLUG}`)

  // The league pill drives the page-wide league filter; the dock follows it until
  // pinned. SSR renders it before hydration wires @click, so retry the open.
  // aria-label, not role+name: the chat scope toggle also renders a "League"
  // button and only the pill carries the label.
  const pill = page.locator('button[aria-label="League"]')
  async function selectLeague(name: string) {
    // Text, not role+name: the pill's PrimeVue Popover keeps its rows out of the
    // accessibility tree, so getByRole never sees them.
    const item = page.locator('button:visible', { hasText: new RegExp(`^${name}$`) })
    // The pill is inside a <ClientOnly>, so it being visible already means it is
    // hydrated - one click, no retry loop (a retried click on a toggle just flips
    // the popover shut again).
    await expect(pill).toBeVisible({ timeout: 30_000 })
    await pill.click()
    await expect(item).toBeVisible({ timeout: 15_000 })
    await item.click()
    await expect(pill).toContainText(name)
  }
  await selectLeague(ALPHA)

  const openBubble = page.locator('button[aria-label="Open league chat"]')
  const pinButton = page.getByTestId('chat-pin')
  // The dock mounts before the pill picks a league, so it starts in Direct mode;
  // flip it back to league chat once open. The bubble is SSR-rendered, so retry
  // until the header is actually up.
  const toLeagueMode = page.locator('button[aria-label="League chat"]')
  async function openDock() {
    await expect(async () => {
      if (await openBubble.isVisible().catch(() => false)) await openBubble.click({ timeout: 2_000 })
      if (await toLeagueMode.isVisible().catch(() => false)) await toLeagueMode.click({ timeout: 2_000 })
      await expect(pinButton).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
  }
  await openDock()

  // The header has no room for a league name next to the bookmark, so the room
  // the dock is actually on is read off the league switcher's accessible name.
  const dockLeague = page.getByTestId('chat-league-switch')
  await expect(dockLeague).toHaveAttribute('aria-label', new RegExp(ALPHA))

  await expect(pinButton).toHaveAttribute('aria-pressed', 'false')
  await pinButton.click()
  await expect(pinButton).toHaveAttribute('aria-pressed', 'true')

  // The whole point: the page moves to Beta, the chat does not.
  await selectLeague(BETA)
  await expect(pill).toContainText(BETA)
  await expect(dockLeague).toHaveAttribute('aria-label', new RegExp(ALPHA))

  // Unpinning hands the dock back: it follows the pill to Beta, and re-pinning
  // now captures Beta.
  await pinButton.click()
  await expect(pinButton).toHaveAttribute('aria-pressed', 'false')
  await expect(dockLeague).toHaveAttribute('aria-label', new RegExp(BETA))
  await pinButton.click()
  await expect(pinButton).toHaveAttribute('aria-pressed', 'true')

  // And it survives a reload (per-device, like the undocked state).
  await page.reload()
  await openDock()
  await expect(pinButton).toHaveAttribute('aria-pressed', 'true')
  await expect(dockLeague).toHaveAttribute('aria-label', new RegExp(BETA))
})
