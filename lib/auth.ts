import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { sso } from '@better-auth/sso'
import { admin } from 'better-auth/plugins'
import { db } from '../db'
import * as schema from '../db/schema'
import { withEncryptedSSO } from '../server/utils/crypto/encrypted-adapter'

const googleClientId = process.env.NUXT_GOOGLE_CLIENT_ID
const googleClientSecret = process.env.NUXT_GOOGLE_CLIENT_SECRET

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
    deleteUser: { enabled: true },
    // Per-user preferences, restored on login (browser/system values are used until set).
    additionalFields: {
      locale: { type: 'string', required: false },
      theme: { type: 'string', required: false },
    },
  },
  // Google login is enabled only when credentials are configured.
  socialProviders:
    googleClientId && googleClientSecret
      ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
      : undefined,
  account: {
    accountLinking: { enabled: true },
  },
  // Runtime-configurable SSO (OIDC + SAML) + role-based user administration.
  plugins: [sso(), admin()],
  secret: process.env.BETTER_AUTH_SECRET ?? process.env.NUXT_BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.NUXT_PUBLIC_AUTH_URL,
})
