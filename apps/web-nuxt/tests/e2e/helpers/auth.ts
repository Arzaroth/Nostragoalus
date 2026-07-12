import { expect, type Locator, type Page } from '@playwright/test'
import { linkFromMail, waitForMail } from './maildev'

export interface Credentials {
  name?: string
  email: string
  password: string
}

// A unique throwaway account per run. Date.now keeps re-runs from colliding on
// the unique email.
export function freshUser(prefix = 'e2e'): Credentials {
  const id = `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`
  return { name: `E2E ${id}`, email: `${id}@example.com`, password: 'e2e-Password123!' }
}

// PrimeVue's v-model only updates on real keystrokes, not Playwright's .fill(),
// so every field is typed.
export async function typeInto(field: Locator, value: string): Promise<void> {
  await field.click()
  await field.pressSequentially(value, { delay: 5 })
}

// Drive the real signup form, then confirm via the mailed verification link (this
// dev stack has require_email_verification on, so sign-up returns no session
// until the address is confirmed). The verify link auto-signs-in, so the user is
// logged in afterwards. Name is the only non-email/password input on the form.
// dismissPrompt defaults on: most specs just want the click-blocking league
// modal gone. Pass false to leave the one-time prompt pending, so a later page
// can dismiss it itself - the onboarding tour only auto-starts in the same
// page-load that the prompt is resolved (an in-session signal, not a durable
// flag), so a spec asserting auto-start must dismiss on the page under test.
export async function signUp(page: Page, user: Credentials, opts: { dismissPrompt?: boolean } = {}): Promise<void> {
  await page.goto('/signup')
  await page.waitForLoadState('networkidle')
  await typeInto(page.locator('input:not([type="email"]):not([type="password"])').first(), user.name ?? user.email)
  await typeInto(page.locator('input[type="email"]'), user.email)
  await typeInto(page.locator('input[type="password"]').first(), user.password)
  await page.getByRole('button', { name: 'Create account' }).click()

  // Two outcomes to tell apart: verification off (a fresh DB's default) signs in
  // and navigates away from /signup; verification on stays put and shows a
  // "verification sent" success Message, then the mailed link auto-signs-in.
  // Decide on whichever lands first rather than racing a fixed short timeout -
  // the HMR dev server can reload mid-redirect (Vite optimizing a route's deps on
  // first hit), which a tight URL-only race would misread as the verify path.
  const leftSignup = page
    .waitForURL((url) => !url.pathname.startsWith('/signup'), { timeout: 30_000 })
    .then(() => 'in' as const)
    .catch(() => 'none' as const)
  const verifySent = page
    .locator('.p-message-success')
    .waitFor({ state: 'visible', timeout: 30_000 })
    .then(() => 'verify' as const)
    .catch(() => 'none' as const)
  const outcome = await Promise.race([leftSignup, verifySent])
  if (outcome === 'verify') {
    const mail = await waitForMail(user.email, { subjectIncludes: 'Confirm', timeoutMs: 20_000 })
    await page.goto(linkFromMail(mail, 'verify-email'))
    // The verify endpoint signs the user in (autoSignInAfterVerification); the
    // /verify-email page's own getSession-then-redirect can race under the HMR dev
    // server, so leave it for the app root ourselves now that the session is set.
    await page.waitForURL((url) => !url.pathname.startsWith('/verify-email'), { timeout: 8_000 }).catch(() => {})
    if (new URL(page.url()).pathname.startsWith('/verify-email')) await page.goto('/')
  }
  if (opts.dismissPrompt !== false) await dismissOnboarding(page)
}

// A fresh account gets a one-time league onboarding prompt: a modal with no close
// button and no Escape, so it intercepts clicks on every page until dismissed.
// "Maybe later" stamps the server-side dismissal, so this only needs doing once.
export async function dismissOnboarding(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: 'Maybe later', exact: true })
    .click({ timeout: 8_000 })
    .catch(() => {})
}

// Two-step login (email -> Continue -> password -> Sign in) for an already-verified
// account.
export async function signIn(page: Page, user: Credentials): Promise<void> {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await typeInto(page.locator('input[type="email"]'), user.email)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  const password = page.locator('input[type="password"]').first()
  await expect(password).toBeVisible()
  await typeInto(password, user.password)
  // "Sign in" exact: the page also has a "Sign in with a passkey" button.
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  // Sign-in creates the session server-side; the client redirect off /login can
  // race under the HMR dev server, so leave it for the app root ourselves if it
  // has not moved on its own.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 8_000 }).catch(() => {})
  if (new URL(page.url()).pathname.startsWith('/login')) await page.goto('/')
}

export const ADMIN: Credentials = {
  email: process.env.E2E_ADMIN_EMAIL ?? 'verify@example.com',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'password123',
}
