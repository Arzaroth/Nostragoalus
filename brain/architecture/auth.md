# Auth

Authentication and authorization run on **better-auth** 1.6.18, configured in
`lib/auth.ts` (`buildAuthOptions`). The Nitro catch-all `server/api/auth/[...all].ts`
mounts all better-auth routes. This file covers the local auth surface, the admin
model, passkeys/2FA/API keys, and the runtime SSO subsystem.

## Local accounts

- Email + password enabled. Local accounts are intentionally **never
  email-verified**, which matters for SSO account linking (below).
- Email verification can be required or not; the flag lives in `app_setting` and
  is warmed into memory at boot by `server/plugins/warm-settings.ts` so sign-in
  and sign-up immediately see the correct state without a per-request DB hit.

## Plugins enabled

`sso`, `passkey`, `apiKey`, plus better-auth's built-in `twoFactor` and `admin`.

## Session guards

All guards live in `server/utils/auth-guards.ts` and are the canonical way a
route learns who is calling:

| Guard | Behaviour |
|---|---|
| `getSessionUser(event)` | resolves the session user or `null` |
| `requireUser(event)` | 401 if not signed in, else the user |
| `requireAdmin(event)` | 401 if anonymous, 403 if not an admin |
| `requireApiKey(key, perms, mustBeAdmin)` | validates a scoped `x-api-key` |
| `requireUserOrApiKey(event, perms)` | session user OR a scoped API key |

Most routes do not call these directly: they go through `defineValidatedHandler`,
which wires the right guard from its `admin` / `apiKey` options. See
[server.md](server.md).

## Admin model

- Admins are seeded from the `NUXT_ADMIN_EMAILS` env var (comma-separated). An
  env admin is promoted to `role: 'admin'` on first admin check, so the
  better-auth `admin` plugin and `requireAdmin` agree.
- `mise run create-admin` provisions one from the CLI.
- Admin endpoints live under `server/api/admin/**` and always require admin.

## Passkeys (WebAuthn)

- Registering a NEW passkey is sensitive, so it is gated by a reauth step:
  `server/middleware/passkey-guard.ts` requires a fresh `ng_reauth` cookie
  (password, and 2FA if enabled, recently confirmed) before the registration
  endpoints respond. Without it the route 403s.

## Two-factor (TOTP)

- TOTP via the built-in `twoFactor` plugin; the enrolment QR is rendered with
  `qrcode`. SSO-managed accounts cannot enable 2FA (see managed-account
  restrictions below).

## API keys

- The `apikey` table stores hashed keys with scoped `permissions` (resource ->
  actions) and optional rate limits. `mise run create-api-key` mints one.
- A route opts into key auth via `defineValidatedHandler({ apiKey: { media:
  ['write'] } })`; non-admin-owned keys never satisfy `requireAdmin`.

## SSO (runtime-configured)

SSO is configured at runtime from the admin UI at `/admin`, backed by
`@better-auth/sso` (OIDC + SAML, SAML via `samlify`). Providers live in the
`sso_provider` table. See also [../features/leagues.md](../features/leagues.md)
for SSO league auto-join.

### Secrets are envelope-encrypted at rest

- `server/utils/crypto/envelope.ts` implements KEK -> DEK -> AES-256-GCM;
  `encrypted-adapter.ts` wraps the better-auth Drizzle adapter so
  `ssoProvider.oidcConfig` / `samlConfig` are sealed on write and opened on read.
- Requires `NUXT_SSO_KEK` (32-byte base64). Without it, provider registration
  throws. The DB column holds `{"v":1,...}` ciphertext, never the plaintext
  secret.

### OIDC discovery trust workaround

- The plugin rejects discovery URLs not in `trustedOrigins`. The admin endpoint
  (`server/api/admin/sso/index.post.ts`) instead fetches the IdP discovery doc
  server-side (admin-trusted), then registers with explicit
  `authorizationEndpoint` / `tokenEndpoint` / `jwksEndpoint` plus
  `oidcConfig.skipDiscovery: true` (note: `skipDiscovery` lives inside
  `oidcConfig`, not top-level). Google is OIDC with issuer
  `https://accounts.google.com`.

### Identifier-first login

- Login is identifier-first: the user enters an email, `GET /api/sso/check`
  resolves the domain via `server/utils/auth/sso-domains.ts`, then either
  redirects through `signIn.sso({ providerId })` or reveals the password field.
- `/login?password=1` is the escape hatch for an IdP outage.
- Multi-domain is a CSV in `sso_provider.domain` (native plugin support, matches
  subdomains). Conflicts across providers are rejected first-come-first-served.

### Account linking and managed accounts

- Because local accounts are never email-verified, better-auth's defaults
  refused SSO -> local links. `buildAuthOptions` sets
  `requireLocalEmailVerified: false` plus a dynamic `trustedProviders()` that
  returns every registered SSO providerId (admin-registered IdPs are
  authoritative).
- SSO-managed accounts (no local `credential` account row) hide
  email/password/2FA/passkeys in `/account`; the auth catch-all 403s
  change-email, passkey registration and 2FA enable server-side.
- `providerId` is immutable: it is baked into the IdP callback URL
  `/api/auth/sso/callback/{providerId}`. Provider edits go through
  `PUT /api/admin/sso/:providerId` (hand-rolled, because the plugin's update
  endpoint is too strict for multi-admin).
- The `provisionUser` callback (`provisionUserOnEveryLogin: true`) runs on every
  login: it stores IdP avatars (see [storage.md](storage.md)) and performs SSO
  league auto-join via `sso_provider_league`.

## Sources

- `lib/auth.ts`, `server/api/auth/[...all].ts`
- `server/utils/auth-guards.ts`, `server/utils/validated-handler.ts`
- `server/plugins/warm-settings.ts`, `server/middleware/passkey-guard.ts`
- `server/utils/crypto/envelope.ts`, `server/utils/crypto/encrypted-adapter.ts`
- `server/utils/auth/sso-domains.ts`, `server/api/admin/sso/**`
- `db/auth-schema.ts` (`user`, `session`, `account`, `ssoProvider`, `apikey`)
