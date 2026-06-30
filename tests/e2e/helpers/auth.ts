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
async function type(field: Locator, value: string): Promise<void> {
  await field.click()
  await field.pressSequentially(value, { delay: 5 })
}

// Drive the real signup form, then confirm via the mailed verification link (this
// dev stack has require_email_verification on, so sign-up returns no session
// until the address is confirmed). The verify link auto-signs-in, so the user is
// logged in afterwards. Name is the only non-email/password input on the form.
export async function signUp(page: Page, user: Credentials): Promise<void> {
  await page.goto('/signup')
  await page.waitForLoadState('networkidle')
  await type(page.locator('input:not([type="email"]):not([type="password"])').first(), user.name ?? user.email)
  await type(page.locator('input[type="email"]'), user.email)
  await type(page.locator('input[type="password"]').first(), user.password)
  await page.getByRole('button', { name: 'Create account' }).click()

  const mail = await waitForMail(user.email, { subjectIncludes: 'Confirm', timeoutMs: 20_000 })
  await page.goto(linkFromMail(mail, 'verify-email'))
  // verify-email verifies + auto-signs-in, then redirects off the verify page.
  await page.waitForURL((url) => !url.pathname.startsWith('/verify-email'), { timeout: 20_000 })
}

// Two-step login (email -> Continue -> password -> Sign in) for an already-verified
// account.
export async function signIn(page: Page, user: Credentials): Promise<void> {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await type(page.locator('input[type="email"]'), user.email)
  await page.getByRole('button', { name: 'Continue' }).click()
  const password = page.locator('input[type="password"]').first()
  await expect(password).toBeVisible()
  await type(password, user.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 })
}

export const ADMIN: Credentials = {
  email: process.env.E2E_ADMIN_EMAIL ?? 'verify@example.com',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'password123',
}
