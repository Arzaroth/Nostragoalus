# SSO onboarding + SCIM provisioning

A guided flow for adding enterprise identity providers and a SCIM 2.0 server for
automated user provisioning. It turns the old "save a provider and it's instantly
live" path into **draft -> test -> verify -> enable**, and lets an IdP create,
update and deactivate users on its own. It is NOT multi-tenant: providers are
still registered by the site admin and `sso_provider.organizationId` stays unused.
The core auth wiring lives in [../architecture/auth.md](../architecture/auth.md);
this doc is the feature-level map.

## Provider lifecycle

- `sso_provider.status`: `draft` | `enabled` | `disabled` (the
  `sso_provider_status` pg enum). Only `enabled` is live - it's the gate in the
  login resolver (`resolveSsoProviderId`), `trustedProviders()`, and the catch-all
  callback guard. Register lands new providers as `draft`; the column default is
  `enabled` purely so the migration grandfathers existing rows.
- **Disabling is non-disruptive**: the gate sits on the sign-in callback paths
  (`server/utils/auth/sso-guard-paths.ts` `ssoCallbackProviderId`), so new
  sign-ins are rejected (redirect to `/login?error=provider_disabled`) but
  existing sessions are never touched.
- `setProviderStatus` enforces the enable gate: a passing connection test
  (`last_test_result.ok`) AND `domainVerified` (or bypass), else `SsoNotReadyError`
  (409).

## Connection test

- `testConnection` (`server/utils/sso/service.ts`) runs automated checks and
  persists `last_tested_at` + `last_test_result`. OIDC: discovery endpoints
  present + a reachable JWKS that publishes keys. SAML: a parseable X.509 cert + a
  reachable entry point. Pure-ish (network mocked in tests).

## Test sign-in (live claim preview, OIDC)

- `server/utils/sso/test-signin.ts`: a real OIDC PKCE round-trip that captures the
  IdP's id_token + userinfo claims, maps them to `{email, name, image}`, and
  stores the result - **without ever creating a user/session or running
  `provisionUser`** (a unit test asserts zero new `user`/`session` rows).
- State is a single-use 256-bit nonce ticket in the `verification` table (5-min
  TTL). The popup hits the public `GET /api/sso/test-callback` (secured by the
  nonce, not a session - the IdP redirect is cookieless), which captures claims
  server-side and posts only `{testId, ok}` to the opener. The admin reads the
  claims through the admin-gated `test-signin-result` route, so claims never ride
  the public response.
- SAML has no live capture: it uses the static bindings preview (ACS / SP entity
  id / NameID / expected attributes) + the connection test. A live SAML ACS would
  have to be pre-registered at the IdP.

## Domain verification

- New providers are `domainVerified=false` (the plugin forces this on register).
  `getDomainVerificationInstructions` mints/reuses a 7-day token in the
  `verification` table and returns the TXT host/value; `verifyDomainDns` resolves
  the record and flips the flag on a match; `bypassDomainVerification` is the
  admin escape hatch (trusted, single-tenant).
- Hand-rolled rather than `auth.api.verifyDomain` (whose owner check requires the
  registering admin), but it matches the plugin's `_better-auth-token-{providerId}`
  identifier and `identifier=value` TXT format, so the plugin's own endpoint stays
  compatible.
- Editing a provider's domain (`server/api/admin/sso/[providerId].put.ts`) resets
  `domainVerified=false`, mirroring the plugin's blocked `update-provider`: a newly
  added domain must be re-verified (or re-bypassed) before it's trusted for login,
  so the DNS proof can't be inherited by a domain that was never checked.

## SCIM provisioning

- `@better-auth/scim` (1.6.23 - 1.6.18 only provisions, `active:false -> ban`
  lands in 1.6.2x) with `storeSCIMToken: 'hashed'`. `scim_provider` holds one row
  per provisioned provider (providerId + hashed token; no `userId` -
  `providerOwnership` is off). The bearer is shown once at generation.
- The SCIM connection id is a derived `{providerId}-scim` (`scimProviderId()` in
  the service): 1.6.23 makes SSO and SCIM provider ids mutually exclusive.
  Provisioned users still link to their SSO login by email, so the distinct id is
  invisible to the end user.
- `active:false` -> admin ban (block login + revoke sessions), data kept;
  `active:true` reactivates. The data plane `/api/auth/scim/v2/*` is open
  (bearer-authed); the session-only management endpoints are blocked over HTTP
  (`isSsoAdminOnlyPath`) and reached only through the admin `scim-token` routes.

## Admin UI

- All in the `/admin` SSO section (`app/pages/admin/index.vue`): status /
  domain-verified / SCIM badges per provider, a Manage panel with the lifecycle
  buttons, test-connection results, the test-sign-in popup + claim preview, the
  domain TXT card (+ bypass), and the reveal-once SCIM token card. i18n keys under
  `admin.sso.*` in all four locales.

## Related

- [../architecture/auth.md](../architecture/auth.md) - the auth engine + SSO core.
- [leagues.md](leagues.md) - SSO league auto-join (runs in `provisionUser`).

## Sources

- `db/auth-schema.ts` (`sso_provider` status/last_test_*, `scim_provider`),
  `shared/types/sso.ts`
- `server/utils/sso/{service,config,test-signin}.ts`
- `server/utils/auth/{sso-domains,sso-guard-paths}.ts`,
  `server/api/auth/[...all].ts`
- `server/api/admin/sso/**`, `server/api/sso/test-callback.get.ts`
- `lib/auth.ts` (the `sso` + `scim` plugin config), `app/pages/admin/index.vue`
