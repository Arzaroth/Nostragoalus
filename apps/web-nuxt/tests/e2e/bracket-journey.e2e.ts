import { expect, test, type Page } from '@playwright/test'
import { dismissOnboarding, freshUser, signUp } from './helpers/auth'
import { E2E_BRACKET_SLUG, cleanupBracket, closeDb, seedFixtureBracketCompetition } from './helpers/db'

test.beforeAll(async () => {
  await seedFixtureBracketCompetition()
})
test.afterAll(async () => {
  await cleanupBracket()
  await closeDb()
})

// The canned tree (server/utils/providers/fixture.ts): ARG beat NED in the QF and
// BRA in the SF; FRA's road ran ENG -> MAR. The final they reach is scheduled,
// not played, and BRA took the bronze final off MAR.
const SEMI = '.br-card[data-home="BRA"][data-away="ARG"]'
const BRONZE = '.br-card[data-home="BRA"][data-away="MAR"]'
const FINAL = '.br-card[data-home="ARG"][data-away="FRA"]'

async function openBracket(page: Page) {
  // The dev server compiles this route on first hit; retry the cold navigation.
  await expect(async () => {
    await page.goto(`/${E2E_BRACKET_SLUG}/bracket`)
  }).toPass({ timeout: 30_000 })
  await dismissOnboarding(page)
  await expect(page.locator(SEMI)).toBeVisible({ timeout: 15_000 })
  // Dismissing the prompt leaves the cursor parked wherever its button was, which
  // can land on a card and trace it before the spec hovers anything. Park the
  // mouse off the tree so each test starts from a clean overlay.
  await page.mouse.move(0, 0)
}

// An SSR-rendered card can be hovered before hydration wires the handler, so
// retry until the lines actually appear. Doubles as the interactivity gate every
// later assertion leans on.
async function hoverUntilTraced(page: Page, selector: string) {
  await expect(async () => {
    await page.mouse.move(0, 0)
    await page.locator(selector).hover()
    await expect(page.locator('.br-line')).toHaveCount(2)
  }).toPass({ timeout: 15_000 })
}

test('hovering a decided tie traces both teams journeys, winner green and loser red', async ({ page }) => {
  await signUp(page, freshUser())
  await openBracket(page)

  await expect(page.locator('.br-line')).toHaveCount(0)
  await hoverUntilTraced(page, SEMI)
  await expect(page.locator('.br-line-win')).toHaveCount(1)
  await expect(page.locator('.br-line-loss')).toHaveCount(1)

  // ARG: QF -> SF -> final. BRA: QF -> SF -> bronze. Two hops each, one subpath
  // per hop, because a card is skipped rather than crossed.
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

test('the trace is normalised so it draws itself in rather than appearing at once', async ({ page }) => {
  await signUp(page, freshUser())
  await openBracket(page)
  await hoverUntilTraced(page, SEMI)

  // pathLength=1 has to land as the real (case-sensitive) SVG attribute, or the
  // dash pattern is measured in pixels and the route appears fully drawn.
  await expect(page.locator('.br-line-win')).toHaveAttribute('pathLength', '1')

  // Sampled past the 1.6s keyframe, so the last one is the settled end state.
  const offsets: number[] = []
  for (let i = 0; i < 6; i++) {
    offsets.push(
      await page.locator('.br-line-win').evaluate(el => Number.parseFloat(getComputedStyle(el).strokeDashoffset)),
    )
    await page.waitForTimeout(400)
  }
  // Monotonically retreating to ~0: the line is being drawn, not revealed. With
  // the dash measured in pixels instead of path units, every sample would sit at
  // 1 and the first assertion below would still pass - the retreat is the check.
  expect(offsets[0]).toBeGreaterThan(0.5)
  expect(offsets.at(-1)).toBeLessThan(0.01)
  expect(offsets.some(o => o > 0.05 && o < 0.95)).toBe(true)
  for (let i = 1; i < offsets.length; i++) expect(offsets[i]).toBeLessThanOrEqual(offsets[i - 1]!)
})

test('the losing side of a semi-final is traced into the bronze tie, not the final', async ({ page }) => {
  await signUp(page, freshUser())
  await openBracket(page)
  await hoverUntilTraced(page, SEMI)

  // BRA lost the SF to ARG, so its journey is QF -> SF -> bronze final.
  const bronze = await page.locator(BRONZE).boundingBox()
  const loss = await page.locator('.br-line-loss').getAttribute('d')
  // The last point of BRA's trace lands on the bronze tie's vertical midline.
  const lastY = Number(loss!.split('L').at(-1)!.split(',')[1])
  const overlayTop = (await page.locator('.br').boundingBox())!.y
  expect(Math.abs(overlayTop + lastY - (bronze!.y + bronze!.height / 2))).toBeLessThan(2)
})

test('an unplayed tie traces nothing', async ({ page }) => {
  await signUp(page, freshUser())
  await openBracket(page)

  // Prove the overlay is live first, so the absence below means the guard fired
  // and not that the page simply never hydrated.
  await hoverUntilTraced(page, SEMI)

  // The final is scheduled with both sides official: a real undecided card, with
  // no outcome to colour a journey by.
  await expect(page.locator(FINAL)).not.toHaveAttribute('data-winner', /.*/)
  await page.locator(FINAL).hover()
  await expect(page.locator('.br-line')).toHaveCount(0)
})
