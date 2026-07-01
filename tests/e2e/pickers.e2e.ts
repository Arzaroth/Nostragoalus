import { test, expect } from '@playwright/test'
import { dismissOnboarding, freshUser, signUp } from './helpers/auth'
import { cleanup, closeDb, seedCompetitionWithMatch, type SeededFixture } from './helpers/db'

// The meta-pick pickers (champion, best scorer) are a pure-visual refactor onto
// the shared MetaPickShowcase frame, with no component tests. This drives the
// real components in a browser: both render pre-kickoff, and selecting a champion
// team flips the showcase from its empty "?" state to the picked flag + worth.
let fixture: SeededFixture

test.beforeAll(async () => {
  // ESP vs BRA, kickoff +6h: the pick window is open, so the pickers show the
  // editable Select + Save path (not the locked state).
  fixture = await seedCompetitionWithMatch()
})
test.afterAll(async () => {
  await cleanup()
  await closeDb()
})

test('meta pickers render and the champion showcase reacts to a pick', async ({ page }) => {
  await signUp(page, freshUser())

  // Signup leaves the app mid-redirect (to the post-signup target); an immediate
  // goto can be aborted by that in-flight client navigation, so retry on abort.
  for (let attempt = 0; ; attempt++) {
    try {
      await page.goto(`/${fixture.slug}/matches`, { waitUntil: 'domcontentloaded' })
      break
    } catch (e) {
      if (attempt >= 3) throw e
    }
  }
  await page.waitForLoadState('networkidle')
  // The fresh account's league-onboarding modal pops on this first authed page
  // and overlays the pickers; dismiss it before asserting on them.
  await dismissOnboarding(page)

  // Champion picker present, in its pre-pick empty state: the dashed "?" frame
  // and the "Pick the winner" caption (no team chosen yet).
  const champ = page.locator('.ng-card', { hasText: 'Your champion' })
  await expect(champ).toBeVisible({ timeout: 20_000 })
  await expect(champ.getByText('?', { exact: true })).toBeVisible()
  // The 64px showcase flag (w-16); absent until a team fills the frame. The Select
  // value renders its own small (w-5) flag, hence scoping to the showcase size.
  await expect(champ.locator('img.w-16')).toHaveCount(0)

  // Best-scorer picker present too (its own card, shared showcase frame).
  const boot = page.locator('.ng-card', { hasText: 'Your best scorer' })
  await expect(boot).toBeVisible()
  await expect(boot.getByText('Pick a team')).toBeVisible()

  // Pick Spain from the champion Select (PrimeVue overlay teleports to body).
  await champ.locator('.p-select').click()
  await page.getByRole('option', { name: 'Spain' }).click()

  // The showcase now shows the picked flag and the preview worth ("worth N pts"),
  // proving the MetaPickShowcase frame reacts to the live selection.
  await expect(champ.locator('img.w-16')).toBeVisible()
  await expect(champ.getByText('Spain').first()).toBeVisible()
  await expect(champ.getByText(/worth \d+ pts/).first()).toBeVisible()
  // The empty-state "?" is gone now that a team fills the frame.
  await expect(champ.getByText('?', { exact: true })).toHaveCount(0)
})
