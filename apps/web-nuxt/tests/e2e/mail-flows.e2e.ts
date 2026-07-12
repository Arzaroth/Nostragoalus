import { test, expect, request } from '@playwright/test'
import { freshUser, signIn, signUp, typeInto } from './helpers/auth'
import { linkFromMail, waitForMail } from './helpers/maildev'

const APP = process.env.E2E_APP_URL ?? 'http://localhost:3000'

// Forgot password: request a reset, follow the mailed link, set a new password,
// and confirm sign-in works with it.
test('forgot password -> reset link -> sign in with new password', async ({ page }) => {
  const user = freshUser('e2e-fp')
  await signUp(page, user) // verified + logged in
  await page.context().clearCookies() // forget the session

  await page.goto('/forgot-password')
  await page.waitForLoadState('networkidle')
  const email = page.locator('input[type="email"]')
  await typeInto(email, user.email)
  await email.press('Enter')

  const mail = await waitForMail(user.email, { subjectIncludes: 'Reset', timeoutMs: 20_000 })
  await page.goto(linkFromMail(mail, 'reset-password'))
  await page.waitForLoadState('networkidle')
  const newPassword = 'e2e-NewPassword456!'
  const pw = page.locator('input[type="password"]')
  await typeInto(pw.nth(0), newPassword)
  await typeInto(pw.nth(1), newPassword)
  await pw.nth(1).press('Enter')
  await expect(page.getByText('you can sign in now')).toBeVisible()

  await signIn(page, { ...user, password: newPassword })
})

// Delete account: trigger the deletion, follow the mailed confirmation link, and
// confirm the account can no longer sign in.
test('delete account -> confirmation link -> account gone', async ({ page }) => {
  const user = freshUser('e2e-del')
  await signUp(page, user) // verified + logged in

  await page.goto('/account')
  await page.waitForLoadState('networkidle')
  // The delete section is at the bottom of a long page; scroll it in before clicking.
  const deleteBtn = page.getByRole('button', { name: 'Delete account', exact: true })
  await deleteBtn.scrollIntoViewIfNeeded()
  await deleteBtn.click()
  const sendBtn = page.getByRole('button', { name: 'Send confirmation mail' })
  await sendBtn.scrollIntoViewIfNeeded()
  await sendBtn.click()

  const mail = await waitForMail(user.email, { subjectIncludes: 'deleting', timeoutMs: 20_000 })
  await page.goto(linkFromMail(mail, 'delete-user'))
  await page.waitForLoadState('networkidle')

  // Account is gone: a fresh sign-in no longer yields a session.
  const api = await request.newContext({ baseURL: APP })
  const res = await api.post('/api/auth/sign-in/email', {
    headers: { Origin: APP },
    data: { email: user.email, password: user.password },
  })
  const body = (await res.json().catch(() => ({}))) as { token?: string }
  expect(body.token, 'deleted account should not sign in').toBeFalsy()
  await api.dispose()
})
