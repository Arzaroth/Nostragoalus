import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { sso } from '@better-auth/sso'
import { passkey } from '@better-auth/passkey'
import { admin, haveIBeenPwned, twoFactor } from 'better-auth/plugins'
import { and, count, eq } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { db } from '../db'
import * as schema from '../db/schema'
import { withEncryptedSSO } from '../server/utils/crypto/encrypted-adapter'
import { verifyTotpCode } from '../server/utils/auth/totp'
import { isSsoManaged } from '../server/utils/auth/sso-managed'
import { symmetricDecrypt } from 'better-auth/crypto'

type AuthDb = PgDatabase<PgQueryResultHKT, typeof schema>

// Mail works only when an SMTP transport is configured (NUXT_SMTP_URL,
// e.g. smtp://user:pass@host:587); TOTP authenticator 2FA needs nothing.
async function sendMail(to: string, subject: string, text: string): Promise<void> {
  const smtpUrl = process.env.NUXT_SMTP_URL
  if (!smtpUrl) throw new Error('email unavailable: NUXT_SMTP_URL is not configured')
  const { createTransport } = await import('nodemailer')
  await createTransport(smtpUrl).sendMail({
    from: process.env.NUXT_SMTP_FROM ?? 'Nostragoalus <no-reply@nostragoalus.local>',
    to,
    subject,
    text,
  })
}

// Exported so tests can run the exact production auth config against a pglite DB.
export function buildAuthOptions(database: AuthDb) {
  return {
    database: withEncryptedSSO(
      drizzleAdapter(database, {
        provider: 'pg',
        schema,
      }),
    ),
    emailAndPassword: {
      enabled: true,
      // Forgot-password mail. Silently skipped for SSO-managed accounts (their
      // IdP owns the credentials; the endpoint's response stays identical so
      // account existence is not revealed). Once a provider is deleted its
      // users stop being managed and can use this flow to set a local password
      // (better-auth creates the credential account on reset if missing).
      async sendResetPassword({ user: u, url }: { user: { id: string; email: string }; url: string }) {
        if (await isSsoManaged(database, u.id)) return
        await sendMail(
          u.email,
          'Reset your Nostragoalus password',
          `Someone (hopefully you) asked to reset the password for this account.\n\nSet a new password: ${url}\n\nThe link expires in 1 hour. If this wasn't you, ignore this mail.`,
        )
      },
    },
    // Let local users change their email (no verification email infra, so it applies directly).
    user: {
      changeEmail: { enabled: true },
      deleteUser: {
        enabled: true,
        // Guards: the last admin cannot orphan the instance, and 2FA holders must
        // present a fresh TOTP code (sent as the x-totp-code header).
        async beforeDelete(u: { id: string }, request?: Request) {
          if ((u as { role?: string }).role === 'admin') {
            const admins = await database.select({ n: count() }).from(schema.user).where(eq(schema.user.role, 'admin'))
            if (Number(admins[0]?.n ?? 0) <= 1) {
              throw new APIError('BAD_REQUEST', { message: 'The last admin account cannot be deleted.' })
            }
          }
          if ((u as { twoFactorEnabled?: boolean | null }).twoFactorEnabled) {
            const code = request?.headers.get('x-totp-code') ?? ''
            const rows = await database.select().from(schema.twoFactor).where(eq(schema.twoFactor.userId, u.id)).limit(1)
            const key = process.env.BETTER_AUTH_SECRET ?? process.env.NUXT_BETTER_AUTH_SECRET
            if (!key) throw new APIError('INTERNAL_SERVER_ERROR', { message: 'Auth secret is not configured.' })
            const secret = rows[0] ? await symmetricDecrypt({ key, data: rows[0].secret }) : ''
            if (!rows[0] || !verifyTotpCode(secret, code, Date.now(), 1, 'raw')) {
              throw new APIError('BAD_REQUEST', { message: 'A valid two-factor code is required to delete this account.' })
            }
          }
        },
      },
      // Per-user preferences, restored on login (browser/system values are used until set).
      additionalFields: {
        locale: { type: 'string' as const, required: false },
        theme: { type: 'string' as const, required: false },
        // Opt-in: show the combined total of everyone's predictions per match.
        showCrowd: { type: 'boolean' as const, required: false },
        // input: false - readable everywhere (session, admin listUsers) but never
        // settable through updateUser; only the admin visibility route writes it.
        hiddenFromLeaderboard: { type: 'boolean' as const, required: false, input: false },
      },
    },
    // Google goes through the runtime SSO admin UI (one config path, secrets encrypted at rest).
    account: {
      accountLinking: {
        enabled: true,
        // Local accounts are never email-verified (no verification-mail infra), so the
        // default requireLocalEmailVerified gate would block every link to them.
        requireLocalEmailVerified: false,
        // SSO providers are registered by the instance admin only, so an identity the
        // IdP asserts is authoritative for its email: an SSO sign-in matching an
        // existing local account links to it instead of failing with
        // account_not_linked. Resolved per request so runtime-registered providers
        // are picked up without a restart.
        async trustedProviders() {
          try {
            const rows = await database.select({ id: schema.ssoProvider.providerId }).from(schema.ssoProvider)
            return rows.map((r) => r.id)
          } catch {
            // Degrade to "no implicit linking" rather than failing the auth request.
            return []
          }
        },
      },
    },
    // Runtime-configurable SSO (OIDC + SAML), role-based user administration,
    // and 2FA (TOTP authenticator + email OTP when SMTP is configured).
    plugins: [
      sso({
        // A successful SSO sign-in makes the IdP authoritative for the account:
        // any local password is removed (the account becomes SSO-managed), so a
        // pre-existing password can't keep bypassing the IdP. Recovery path if
        // the provider ever goes away: the forgot-password flow recreates the
        // credential account.
        provisionUserOnEveryLogin: true,
        async provisionUser({ user: u }: { user: { id: string } }) {
          await database
            .delete(schema.account)
            .where(and(eq(schema.account.userId, u.id), eq(schema.account.providerId, 'credential')))
        },
      }),
      admin(),
      // Reject passwords found in known breaches (HIBP k-anonymity API, no key needed).
      haveIBeenPwned(),
      // WebAuthn passkeys (rpID/origin derive from baseURL).
      passkey({ rpName: 'Nostragoalus' }),
      twoFactor({
        otpOptions: {
          async sendOTP({ user: u, otp }: { user: { email: string }; otp: string }) {
            await sendMail(u.email, 'Your Nostragoalus sign-in code', `Your verification code is: ${otp}\n\nIt expires in 5 minutes.`)
          },
        },
      }),
    ],
    secret: process.env.BETTER_AUTH_SECRET ?? process.env.NUXT_BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL ?? process.env.NUXT_PUBLIC_AUTH_URL,
  }
}

export const auth = betterAuth(buildAuthOptions(db))
