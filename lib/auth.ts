import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { sso } from '@better-auth/sso'
import { passkey } from '@better-auth/passkey'
import { admin, haveIBeenPwned, twoFactor } from 'better-auth/plugins'
import { count, eq } from 'drizzle-orm'
import { db } from '../db'
import * as schema from '../db/schema'
import { withEncryptedSSO } from '../server/utils/crypto/encrypted-adapter'
import { verifyTotpCode } from '../server/utils/auth/totp'
import { symmetricDecrypt } from 'better-auth/crypto'

// Email OTP works only when an SMTP transport is configured (NUXT_SMTP_URL,
// e.g. smtp://user:pass@host:587); TOTP authenticator 2FA needs nothing.
async function sendOtpMail(to: string, otp: string): Promise<void> {
  const smtpUrl = process.env.NUXT_SMTP_URL
  if (!smtpUrl) throw new Error('email OTP unavailable: NUXT_SMTP_URL is not configured')
  const { createTransport } = await import('nodemailer')
  await createTransport(smtpUrl).sendMail({
    from: process.env.NUXT_SMTP_FROM ?? 'Nostragoalus <no-reply@nostragoalus.local>',
    to,
    subject: 'Your Nostragoalus sign-in code',
    text: `Your verification code is: ${otp}\n\nIt expires in 5 minutes.`,
  })
}

export const auth = betterAuth({
  database: withEncryptedSSO(
    drizzleAdapter(db, {
      provider: 'pg',
      schema,
    }),
  ),
  emailAndPassword: {
    enabled: true,
  },
  // Let local users change their email (no verification email infra, so it applies directly).
  user: {
    changeEmail: { enabled: true },
    deleteUser: {
      enabled: true,
      // Guards: the last admin cannot orphan the instance, and 2FA holders must
      // present a fresh TOTP code (sent as the x-totp-code header).
      async beforeDelete(u, request) {
        if ((u as { role?: string }).role === 'admin') {
          const admins = await db.select({ n: count() }).from(schema.user).where(eq(schema.user.role, 'admin'))
          if (Number(admins[0]?.n ?? 0) <= 1) {
            throw new APIError('BAD_REQUEST', { message: 'The last admin account cannot be deleted.' })
          }
        }
        if ((u as { twoFactorEnabled?: boolean | null }).twoFactorEnabled) {
          const code = request?.headers.get('x-totp-code') ?? ''
          const rows = await db.select().from(schema.twoFactor).where(eq(schema.twoFactor.userId, u.id)).limit(1)
          const key = process.env.BETTER_AUTH_SECRET ?? process.env.NUXT_BETTER_AUTH_SECRET ?? ''
          const secret = rows[0] ? await symmetricDecrypt({ key, data: rows[0].secret }) : ''
          if (!rows[0] || !verifyTotpCode(secret, code, Date.now(), 1, 'raw')) {
            throw new APIError('BAD_REQUEST', { message: 'A valid two-factor code is required to delete this account.' })
          }
        }
      },
    },
    // Per-user preferences, restored on login (browser/system values are used until set).
    additionalFields: {
      locale: { type: 'string', required: false },
      theme: { type: 'string', required: false },
      // Opt-in: show the combined total of everyone's predictions per match.
      showCrowd: { type: 'boolean', required: false },
    },
  },
  // Google goes through the runtime SSO admin UI (one config path, secrets encrypted at rest).
  account: {
    accountLinking: { enabled: true },
  },
  // Runtime-configurable SSO (OIDC + SAML), role-based user administration,
  // and 2FA (TOTP authenticator + email OTP when SMTP is configured).
  plugins: [
    sso(),
    admin(),
    // Reject passwords found in known breaches (HIBP k-anonymity API, no key needed).
    haveIBeenPwned(),
    // WebAuthn passkeys (rpID/origin derive from baseURL).
    passkey({ rpName: 'Nostragoalus' }),
    twoFactor({
      otpOptions: {
        async sendOTP({ user: u, otp }) {
          await sendOtpMail(u.email, otp)
        },
      },
    }),
  ],
  secret: process.env.BETTER_AUTH_SECRET ?? process.env.NUXT_BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.NUXT_PUBLIC_AUTH_URL,
})
