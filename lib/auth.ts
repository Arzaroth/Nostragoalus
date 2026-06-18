import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { sso } from '@better-auth/sso'
import { passkey } from '@better-auth/passkey'
import { admin, haveIBeenPwned, twoFactor } from 'better-auth/plugins'
import { apiKey } from '@better-auth/api-key'
import { and, count, eq } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { db } from '../db'
import * as schema from '../db/schema'
import { withEncryptedSSO } from '../server/utils/crypto/encrypted-adapter'
import { verifyTotpCode } from '../server/utils/auth/totp'
import { isSsoManaged } from '../server/utils/auth/sso-managed'
import { emailVerificationRequiredSync, loadEmailVerificationFlag } from '../server/utils/auth/email-verification'
import { fetchAvatarDataUrl, isUnusableAvatarUrl } from '../server/utils/auth/avatar'
import { autoJoinSsoLeagues } from '../server/utils/leagues/auto-join'
import { symmetricDecrypt } from 'better-auth/crypto'
import { isSkinId } from '../app/utils/skins'
import { sendMail } from './mail'

type AuthDb = PgDatabase<PgQueryResultHKT, typeof schema>

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
      // Admin-toggled at runtime (no redeploy). better-auth reads this getter
      // synchronously on every sign-in/sign-up, so flipping the cached flag
      // takes effect immediately: sign-ups stop auto-signing-in and get a
      // verification mail, and unverified password sign-ins are blocked (the
      // login page offers a manual resend). SSO sign-ins use a different route,
      // so they're unaffected (and SSO users arrive already verified).
      get requireEmailVerification() {
        return emailVerificationRequiredSync(database)
      },
      // Forgot-password mail. Silently skipped for SSO-managed accounts (their
      // IdP owns the credentials; the endpoint's response stays identical so
      // account existence is not revealed). Once a provider is deleted its
      // users stop being managed and can use this flow to set a local password
      // (better-auth creates the credential account on reset if missing).
      async sendResetPassword({ user: u, url }: { user: { id: string; email: string }; url: string }) {
        if (await isSsoManaged(database, u.id)) return
        await sendMail(u.email, 'Reset your Nostragoalus password', {
          title: 'Reset your password',
          intro: 'Someone (hopefully you) asked to reset the password for this account.',
          button: { label: 'Set a new password', url },
          footer: "The link expires in 1 hour. If this wasn't you, ignore this mail.",
        })
      },
    },
    // Verification-mail infra. Always configured so the verify-email endpoints
    // exist; whether it's enforced is the runtime getter above. The link is
    // mailed once on sign-up (better-auth's sendOnSignUp defaults to the
    // requireEmailVerification flag). sendOnSignIn stays off so a blocked
    // unverified sign-in does NOT fire a fresh mail every attempt - the login
    // page exposes an explicit "resend" the stuck user triggers instead.
    emailVerification: {
      // Clicking the link signs the user in and drops them on the callbackURL,
      // instead of marking them verified but session-less and bouncing them to
      // /login. (Reopening an already-used link still has no session to create,
      // so a fresh browser lands on /login - that's expected.)
      autoSignInAfterVerification: true,
      async sendVerificationEmail({ user: u, url }: { user: { email: string }; url: string }) {
        await sendMail(u.email, 'Confirm your Nostragoalus email', {
          title: 'Confirm your email',
          intro: 'Welcome to Nostragoalus! Confirm this email address to activate your account.',
          button: { label: 'Verify email', url },
          footer: "If you didn't create an account, you can ignore this mail.",
        })
      },
    },
    // Let local users change their email (no verification email infra, so it applies directly).
    user: {
      changeEmail: { enabled: true },
      deleteUser: {
        enabled: true,
        // With SMTP available, every deletion is confirmed through a mailed
        // link (better-auth routes password-supplied requests through it too).
        // Without SMTP it falls back to password / fresh-session confirmation.
        ...(process.env.NUXT_SMTP_URL
          ? {
              async sendDeleteAccountVerification({ user: u, url }: { user: { email: string }; url: string }) {
                await sendMail(u.email, 'Confirm deleting your Nostragoalus account', {
                  title: 'Confirm account deletion',
                  intro: 'Someone (hopefully you) asked to permanently delete this account, including all its predictions.',
                  button: { label: 'Confirm deletion', url },
                  footer: "The link expires in 24 hours. If this wasn't you, ignore this mail.",
                })
              },
            }
          : {}),
        // Guards: the last admin cannot orphan the instance, and 2FA holders must
        // present a fresh TOTP code (sent as the x-totp-code header) - unless the
        // deletion was already confirmed by the mailed link, which proves mailbox
        // ownership and arrives without our custom header.
        async beforeDelete(u: { id: string }, request?: Request) {
          if ((u as { role?: string }).role === 'admin') {
            const admins = await database.select({ n: count() }).from(schema.user).where(eq(schema.user.role, 'admin'))
            if (Number(admins[0]?.n ?? 0) <= 1) {
              throw new APIError('BAD_REQUEST', { message: 'The last admin account cannot be deleted.' })
            }
          }
          const viaMailedLink = request?.url?.includes('/delete-user/callback') ?? false
          if (!viaMailedLink && (u as { twoFactorEnabled?: boolean | null }).twoFactorEnabled) {
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
        // Opt-out: bookmaker odds under each match (null/undefined = shown).
        showOdds: { type: 'boolean' as const, required: false },
        // Cosmetic skin selection + its unlock gate (both user-settable).
        skin: { type: 'string' as const, required: false },
        skinsUnlocked: { type: 'boolean' as const, required: false },
        // Opt-out of the global rankings; profile gated to league mates/admins.
        profilePrivate: { type: 'boolean' as const, required: false },
        // Per-category web-push toggles (null = the category default).
        pushReminders: { type: 'boolean' as const, required: false },
        pushKickoff: { type: 'boolean' as const, required: false },
        pushGoals: { type: 'boolean' as const, required: false },
        pushMatchResults: { type: 'boolean' as const, required: false },
        pushTournament: { type: 'boolean' as const, required: false },
        pushLeague: { type: 'boolean' as const, required: false },
        // Newest changelog version the user has viewed (settable: the client
        // stamps it on first load and when the changelog is opened).
        lastSeenChangelogVersion: { type: 'string' as const, required: false },
        // input: false - readable everywhere (session, admin listUsers) but never
        // settable through updateUser; only the admin visibility route writes it.
        hiddenFromLeaderboard: { type: 'boolean' as const, required: false, input: false },
        // input: false - the onboarding dialog reads it from the session; only
        // the league service writes it (dismiss, or first join/create).
        leaguePromptDismissedAt: { type: 'date' as const, required: false, input: false },
      },
    },
    // Constrain the cosmetic skin to the known set on write. The read side
    // (resolveSkin) already sanitizes on render; this keeps an arbitrary value
    // from ever landing in the column for any other reader.
    databaseHooks: {
      user: {
        update: {
          before: async (data: Record<string, unknown>) => {
            if (typeof data.skin === 'string' && data.skin !== '' && !isSkinId(data.skin)) data.skin = null
            return { data }
          },
        },
      },
    },
    // Google goes through the runtime SSO admin UI (one config path, secrets encrypted at rest).
    account: {
      accountLinking: {
        enabled: true,
        // Local accounts may be unverified (verification is an optional,
        // admin-toggled gate), so don't let the default requireLocalEmailVerified
        // gate block an SSO identity from linking to an existing local account.
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
        // @better-auth/sso 1.6.x hardcodes trustProviderByName:false, so our
        // accountLinking.trustedProviders list no longer drives SSO link-trust;
        // trust now comes from a per-provider `domainVerified` flag + an email
        // domain match. Without it, an SSO sign-in matching an existing local
        // account fails with "account not linked". We can't use the IdP's
        // email_verified claim instead - Entra doesn't emit a usable one. So we
        // enable the domainVerified mechanism and mark admin-registered
        // providers verified for their configured domains (db column defaults
        // true): a provider is trusted to own the email domains an admin
        // assigned it, which is exactly the old trustedProviders intent.
        domainVerification: { enabled: true },
        // A successful SSO sign-in makes the IdP authoritative for the account:
        // any local password is removed (the account becomes SSO-managed), so a
        // pre-existing password can't keep bypassing the IdP. Recovery path if
        // the provider ever goes away: the forgot-password flow recreates the
        // credential account. Admins are exempt - their password is break-glass
        // access for deleting a broken provider (otherwise recovering the
        // instance would need host access via `mise run create-admin`).
        provisionUserOnEveryLogin: true,
        async provisionUser({ user: u, provider }: { user: { id: string }; provider: { providerId: string } }) {
          const rows = await database.select({ role: schema.user.role, image: schema.user.image }).from(schema.user).where(eq(schema.user.id, u.id)).limit(1)
          // The IdP mapped a token-gated picture URL a browser can't load (e.g.
          // the MS Graph photo endpoint). Fetch it once with the stored access
          // token and inline it as a data URL; if that fails, null it so the
          // placeholder shows. Either outcome stops it being an unusable URL, so
          // this runs only on the first login after this code ships. With no
          // token yet, leave it for the next login to retry.
          if (isUnusableAvatarUrl(rows[0]?.image)) {
            const acct = await database
              .select({ token: schema.account.accessToken })
              .from(schema.account)
              .where(and(eq(schema.account.userId, u.id), eq(schema.account.providerId, provider.providerId)))
              .limit(1)
            if (acct[0]?.token) {
              const dataUrl = await fetchAvatarDataUrl(rows[0]!.image!, acct[0].token)
              await database.update(schema.user).set({ image: dataUrl }).where(eq(schema.user.id, u.id))
            }
          }
          if (rows[0]?.role !== 'admin') {
            await database
              .delete(schema.account)
              .where(and(eq(schema.account.userId, u.id), eq(schema.account.providerId, 'credential')))
          }
          try {
            await autoJoinSsoLeagues(database, { userId: u.id, providerId: provider.providerId })
          } catch {
            // League bookkeeping must never block an SSO login.
          }
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
            await sendMail(u.email, 'Your Nostragoalus sign-in code', {
              title: 'Your sign-in code',
              intro: 'Use this code to finish signing in:',
              code: otp,
              footer: "It expires in 5 minutes. If you didn't try to sign in, ignore this mail.",
            })
          },
        },
      }),
      // Scoped machine credentials (e.g. the watch-link curation bot). Keys
      // authenticate ONLY through the explicit api-key path in
      // defineValidatedHandler (the plugin's x-api-key header is stripped from
      // ordinary session guards, so a key never silently grants session access);
      // each route declares the permission it requires and the key's owner must
      // still be an admin for admin routes.
      apiKey(),
    ],
    secret: process.env.BETTER_AUTH_SECRET ?? process.env.NUXT_BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL ?? process.env.NUXT_PUBLIC_AUTH_URL,
  }
}

export const auth = betterAuth(buildAuthOptions(db))

// Warm the email-verification flag cache so the first sign-in after a restart
// reads the real value instead of the default (false).
void loadEmailVerificationFlag(db).catch(() => {})
