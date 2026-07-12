import { test, expect } from '@playwright/test'

const APP = process.env.E2E_APP_URL ?? 'http://localhost:3000'

// RTL infra: the active locale must drive <html lang/dir>. For Arabic that means
// dir="rtl" baked into the SERVER's first paint (so the page never flips from LTR
// to RTL after hydration), and switching to Arabic at runtime must flip the live
// document too. No DB seeding: the footer switcher + locale cookie are public.
test.describe('Arabic RTL', () => {
  test('default locale renders LTR', async ({ page }) => {
    await page.goto('/')
    const html = page.locator('html')
    await expect(html).toHaveAttribute('dir', 'ltr')
    await expect(html).toHaveAttribute('lang', 'en')
  })

  test('ng_locale=ar cookie renders RTL in the server markup', async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: 'ng_locale', value: 'ar', url: baseURL ?? APP }])
    const res = await page.goto('/')
    // Assert the raw SSR HTML already carries dir/lang, not just the hydrated DOM.
    const body = (await res?.text()) ?? ''
    expect(body).toMatch(/<html[^>]*\bdir="rtl"/)
    expect(body).toMatch(/<html[^>]*\blang="ar"/)
    const html = page.locator('html')
    await expect(html).toHaveAttribute('dir', 'rtl')
    await expect(html).toHaveAttribute('lang', 'ar')
    await page.screenshot({ path: '/tmp/ng-e2e-results/rtl-ar-home.png', fullPage: true })
  })

  test('switching to Arabic in the footer flips the document to rtl', async ({ page }) => {
    await page.goto('/')
    // The PrimeVue Select only opens once the footer has hydrated. The footer's
    // theme toggle lives in <ClientOnly> behind a disabled fallback, so the live
    // (enabled) button appearing is a precise hydration signal.
    await expect(page.locator('footer button[aria-label="Toggle theme"]:not([disabled])')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
    await page.locator('.footer-select').scrollIntoViewIfNeeded()
    await page.locator('.footer-select').click()
    await page.getByRole('option', { name: /Arabic/ }).click()
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
  })
})
