# Auth

Authentication and authorization run on **better-auth** 1.6.23, configured in
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

`sso`, `scim`, `passkey`, `apiKey`, plus better-auth's built-in `twoFactor` and
`admin`.

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
- A self-hosted or internal SSO IdP whose token endpoint resolves to a private
  address is refused by the plugin's SSRF guard unless its origin is trusted.
  `buildAuthOptions` (`lib/auth.ts`) reads `NUXT_SSO_TRUSTED_ORIGINS`
  (comma-separated, trimmed) into better-auth's `trustedOrigins` for exactly that;
  public IdPs need nothing. The SSO e2e uses it to trust its dockerized Keycloak
  (`http://keycloak:8080`).

### Identifier-first login

- Login is identifier-first: the user enters an email, `GET /api/sso/check`
  resolves the domain via `server/utils/auth/sso-domains.ts`, then either
  redirects through `signIn.sso({ providerId })` or reveals the password field.
- `/login?password=1` is the escape hatch for an IdP outage.
- Multi-domain is a CSV in `sso_provider.domain` (native plugin support, matches
  subdomains). Conflicts across providers are rejected first-come-first-served
  (status-agnostic: a draft still reserves its domain).
- The resolver only returns `enabled` + `domainVerified` providers, so a
  draft/disabled/unverified provider never captures a login (the password field
  is revealed instead).

### Account linking and managed accounts

- Because local accounts are never email-verified, better-auth's defaults
  refused SSO -> local links. `buildAuthOptions` sets
  `requireLocalEmailVerified: false` plus a dynamic `trustedProviders()` that
  returns every `enabled` SSO providerId (admin-registered IdPs are
  authoritative; a draft/disabled provider is not trusted for implicit linking).
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

### Onboarding lifecycle (draft -> test -> verify -> enable)

- A provider has a `status` (`draft` / `enabled` / `disabled`) on `sso_provider`.
  The register route lands new providers as `draft`; the column default is
  `enabled` only so the `ADD COLUMN` migration grandfathers pre-existing rows.
  Only `enabled` providers are live (login resolver + `trustedProviders` +
  callback gate). Disabling is non-disruptive: existing sessions keep working
  because the catch-all gate sits only on the sign-in callback paths, never on
  session validation.
- Logic lives in the covered `server/utils/sso/service.ts`; the admin routes
  (`server/api/admin/sso/[providerId]/{status,test-connection,verify-domain,
  bypass-domain,scim-token}`) stay thin.
- **Connection test** (`testConnection`): automated checks - OIDC fetches the
  discovery endpoints + a JWKS with keys; SAML parses the X.509 cert and reaches
  the entry point. The result (`last_test_result.ok`) is the gate to enable.
- **Test sign-in** (`server/utils/sso/test-signin.ts`, OIDC only): a real PKCE
  round-trip that captures the IdP's claims and maps them to our fields WITHOUT
  creating a user/session (it never runs `provisionUser`). A single-use 256-bit
  nonce ticket lives in the `verification` table (5-min TTL); the public callback
  `GET /api/sso/test-callback` is secured by that nonce (the IdP redirect is
  cookieless), captures claims server-side, and posts only `{testId, ok}` back to
  the opener. The admin reads the claims through the admin-gated result route.
  SAML uses the static bindings preview (ACS / entityID / NameID / attributes)
  plus the connection test instead - a live SAML ACS must be pre-registered at the
  IdP.
- **Domain verification**: new providers are `domainVerified=false` (the plugin
  forces this on register). The admin publishes a DNS TXT record and runs
  `verifyDomainDns`, or `bypassDomainVerification` (admin-trusted, single-tenant).
  Hand-rolled rather than `auth.api.verifyDomain` so it isn't gated by the
  plugin's registering-admin-only owner check, but it matches the plugin's
  `_better-auth-token-{providerId}` identifier + TXT format.

### SCIM provisioning

- `@better-auth/scim` (`scim({ storeSCIMToken: 'hashed' })`) exposes SCIM 2.0
  user provisioning under `/api/auth/scim/v2/*` (bearer-authed by the IdP). The
  token is stored hashed in `scim_provider` (shown once at generation, like
  `apikey`), so the encrypted-adapter does not cover it.
- `active:false` maps to the admin plugin's ban (block login + revoke sessions)
  and keeps the user's data; `active:true` reactivates.
- The session-only management endpoints (`generate-token`,
  `*-provider-connection`) are blocked over HTTP by the catch-all
  (`isSsoAdminOnlyPath`) - any signed-in user could otherwise mint a provisioning
  bearer - and exposed only through the admin `scim-token` routes (generate/
  rotate, revoke). Provider delete drops the `scim_provider` row by hand (no FK).

## Sources

- `lib/auth.ts`, `server/api/auth/[...all].ts`
- `server/utils/auth-guards.ts`, `server/utils/validated-handler.ts`
- `server/plugins/warm-settings.ts`, `server/middleware/passkey-guard.ts`
- `server/utils/crypto/envelope.ts`, `server/utils/crypto/encrypted-adapter.ts`
- `server/utils/auth/sso-domains.ts`, `server/utils/auth/sso-guard-paths.ts`
- `server/utils/sso/{service,config,test-signin}.ts`, `server/api/admin/sso/**`
- `server/api/sso/{check,test-callback}.get.ts`
- See [../features/sso-provisioning.md](../features/sso-provisioning.md)
- `db/auth-schema.ts` (`user`, `session`, `account`, `ssoProvider`, `apikey`)
