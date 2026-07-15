import { expect, test } from '@playwright/test'
import { dismissOnboarding, freshUser, signUp } from './helpers/auth'
import { E2E_BRACKET_SLUG, cleanupBracket, closeDb, seedFixtureBracketCompetition } from './helpers/db'

test.beforeAll(async () => {
  await seedFixtureBracketCompetition()
})
test.afterAll(async () => {
  await cleanupBracket()
  await closeDb()
})

// The canned tree (server/utils/providers/fixture.ts): ARG beat NED in the QF,
// BRA in the SF, and FRA in the final; FRA's road ran ENG -> MAR -> the final.
const FINAL = '.br-card[data-home="ARG"][data-away="FRA"]'

async function openBracket(page: import('@playwright/test').Page) {
  // The dev server compiles this route on first hit; retry the cold navigation.
  await expect(async () => {
    await page.goto(`/${E2E_BRACKET_SLUG}/bracket`)
  }).toPass({ timeout: 30_000 })
  await dismissOnboarding(page)
  await expect(page.locator(FINAL)).toBeVisible({ timeout: 15_000 })
  // Dismissing the prompt leaves the cursor parked wherever its button was, which
  // can land on a card and trace it before the spec hovers anything. Park the
  // mouse off the tree so each test starts from a clean overlay.
  await page.mouse.move(0, 0)
}

test('hovering a decided tie traces both teams journeys, winner green and loser red', async ({ page }) => {
  await signUp(page, freshUser())
  await openBracket(page)

  await expect(page.locator('.br-line')).toHaveCount(0)

  // An SSR-rendered card can be hovered before hydration wires the handler, so
  // retry until the lines actually appear rather than asserting on the first pass.
  await expect(async () => {
    await page.locator(FINAL).hover()
    await expect(page.locator('.br-line-win')).toHaveCount(1)
  }).toPass({ timeout: 15_000 })
  await expect(page.locator('.br-line-loss')).toHaveCount(1)

  // Both teams played a QF and an SF before the final: 2 hops, so 2 subpaths.
  for (const cls of ['.br-line-win', '.br-line-loss']) {
    const d = await page.locator(cls).getAttribute('d')
    expect(d!.match(/M/g)).toHaveLength(2)
  }

  // The colours are the outcome of the hovered tie, not a per-team constant.
  await expect(page.locator('.br-line-win')).toHaveCSS('stroke', 'rgb(34, 197, 94)')
  await expect(page.locator('.br-line-loss')).toHaveCSS('stroke', 'rgb(239, 68, 68)')

  // Leaving the tree clears the trace.
  await page.mouse.move(0, 0)
  await expect(page.locator('.br-line')).toHaveCount(0)
})

test('the losing side of a semi-final is traced into the bronze tie, not the final', async ({ page }) => {
  await signUp(page, freshUser())
  await openBracket(page)

  // BRA lost the SF to ARG, so its journey is QF -> SF -> bronze final.
  await expect(async () => {
    await page.locator('.br-card[data-home="BRA"][data-away="ARG"]').hover()
    await expect(page.locator('.br-line-loss')).toHaveCount(1)
  }).toPass({ timeout: 15_000 })

  const bronze = await page.locator('.br-card[data-home="BRA"][data-away="MAR"]').boundingBox()
  const loss = await page.locator('.br-line-loss').getAttribute('d')
  // The last point of BRA's trace lands on the bronze tie's vertical midline.
  const lastY = Number(loss!.split('L').at(-1)!.split(',')[1])
  const overlayTop = (await page.locator('.br').boundingBox())!.y
  expect(Math.abs(overlayTop + lastY - (bronze!.y + bronze!.height / 2))).toBeLessThan(2)
})

test('an undecided tie traces nothing', async ({ page }) => {
  await signUp(page, freshUser())
  await openBracket(page)

  // Every tie in the canned tree is decided, so strip one cell's outcome to
  // stand in for a fixture that has not been played yet.
  await page.locator(FINAL).evaluate(el => el.removeAttribute('data-winner'))
  await page.locator(FINAL).hover()
  await expect(page.locator('.br-line')).toHaveCount(0)
})
