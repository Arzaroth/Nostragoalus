import { expect, test } from '@playwright/test'
import { freshUser, typeInto } from './helpers/auth'
import { linkFromMail, waitForMail } from './helpers/maildev'
import {
  cleanup,
  closeDb,
  getUserIdByEmail,
  seedCompetitionWithMatch,
  seedLeague,
  seedLeagueInvite,
  type SeededFixture,
} from './helpers/db'

// This spec drives the signup form itself rather than the signUp helper: the
// helper always signs up with no `next`, which is exactly the case that never
// regressed.
let fixture: SeededFixture
let token: string

test.beforeAll(async () => {
  fixture = await seedCompetitionWithMatch()
  // The league only has to exist and be owned by somebody; the admin account
  // global setup already created is cheaper than a second browser signup.
  const ownerId = await getUserIdByEmail(process.env.E2E_ADMIN_EMAIL ?? 'verify@example.com')
  const leagueId = await seedLeague(fixture.competitionId, ownerId)
  token = await seedLeagueInvite(leagueId)
})

test.afterAll(async () => {
  await cleanup()
  await closeDb()
})

test('a league invite survives sign-up and the email confirmation round-trip', async ({ page }) => {
  const invitePath = `/leagues/join/${token}`
  const user = freshUser('e2e-inv')

  await page.goto(invitePath)
  await expect(page.getByRole('heading', { name: 'E2E League' })).toBeVisible()

  // Signed out, the landing page bounces through login carrying itself as ?next.
  // Retried: the SSR-rendered button accepts a click before hydration wires it.
  await expect(async () => {
    await page.getByRole('button', { name: 'Sign in to join' }).click()
    await expect(page).toHaveURL(/\/login\?next=/)
  }).toPass({ timeout: 20_000 })
  expect(new URL(page.url()).searchParams.get('next')).toBe(invitePath)

  await page.getByRole('link', { name: 'Need an account? Sign up' }).click()
  await expect(page).toHaveURL(/\/signup\?next=/)
  expect(new URL(page.url()).searchParams.get('next')).toBe(invitePath)

  await typeInto(page.locator('input:not([type="email"]):not([type="password"])').first(), user.name ?? user.email)
  await typeInto(page.locator('input[type="email"]'), user.email)
  await typeInto(page.locator('input[type="password"]').first(), user.password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.locator('.p-message-success')).toBeVisible({ timeout: 30_000 })

  const mail = await waitForMail(user.email, { subjectIncludes: 'Confirm', timeoutMs: 20_000 })
  await page.goto(linkFromMail(mail, 'verify-email'))

  // The regression this guards: confirming used to drop the destination and land
  // on the default matches page, leaving the invite to be found again by hand.
  await expect(page).toHaveURL(new RegExp(`/leagues/join/${token}$`), { timeout: 20_000 })
  await expect(page.getByRole('heading', { name: 'E2E League' })).toBeVisible()

  // A brand-new account with no memberships would otherwise get the unclosable
  // league prompt right on top of the invite, and settling it hands off to the
  // tour, which navigates to /matches. The invite has to be reachable.
  await expect(page.getByRole('button', { name: 'Maybe later', exact: true })).toHaveCount(0)
  await expect(async () => {
    await page.getByRole('button', { name: 'Join league' }).click()
    await expect(page).toHaveURL(/\/leagues\/[0-9a-f-]{36}$/)
  }).toPass({ timeout: 20_000 })
})
