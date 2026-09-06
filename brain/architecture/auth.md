# Auth

Authentication and authorization run on **better-auth** 1.6.27, configured in
`apps/web-nuxt/lib/auth.ts` (`buildAuthOptions`). The Nitro catch-all `apps/web-nuxt/server/api/auth/[...all].ts`
mounts all better-auth routes. This file covers the local auth surface, the admin
model, passkeys/2FA/API keys, and the runtime SSO subsystem.

Every guard that decides on a `/api/auth/*` path matches
`routedPath(event)` (`apps/web-nuxt/server/utils/auth/routed-path.ts`), never
`event.path`. better-auth dispatches on the WHATWG-normalized pathname, which
resolves `.`, `..` and `\`, while `event.path` keeps them verbatim - so a guard
reading `event.path` sees a different string than the router and
`/api/auth/x/../scim/generate-token` walks past it into an endpoint gated only by
a session. `event.path` is also percent-DECODED, while the dispatcher parses the
RAW target, so `%23`, `%3f` and `%5c` decode into path delimiters that truncate a
naive guard's view while the router still resolves the traversal. `routedPath`
therefore derives the path exactly as `getRequestURL` does - raw
`originalUrl`, leading slash run collapsed - and parses that. Both the catch-all
and the passkey middleware go through the helper.

The rule to keep: a guard must consume the path the dispatcher will route on,
derived the same way, rather than re-normalizing a different string. Trailing
slashes are deliberately left alone - better-call 404s a trailing-slash mismatch
itself, so stripping would make the guard judge a path that is never routed.

## Local accounts

- Email + password enabled. Local accounts are intentionally **never
  email-verified**, which matters for SSO account linking (below).
- Email verification can be required or not; the flag lives in `app_setting` and
  is warmed into memory at boot by `apps/web-nuxt/server/plugins/warm-settings.ts` so sign-in
  and sign-up immediately see the correct state without a per-request DB hit.

## Plugins enabled

`sso`, `scim`, `passkey`, `apiKey`, plus better-auth's built-in `twoFactor`,
`admin`, and `haveIBeenPwned` (rejects breached passwords via Have I Been Pwned).

## Session guards

All guards live in `apps/web-nuxt/server/utils/auth-guards.ts` and are the canonical way a
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

## Session lifetime

- `buildAuthOptions` sets `session.expiresIn` to **90 days** with
  `session.updateAge` of **1 day** (sliding): an active session refreshes its
  expiry at most once a day, so a regularly-used session effectively never
  lapses, and an idle one survives 90 days.
- The long `expiresIn` is deliberate. better-auth mints the session cookie with
  `Max-Age = expiresIn`, so a long expiry makes it a long-lived **persistent**
  cookie. That was the fix for "logged out for no reason" reports, worst on iOS
  **installed PWAs** (a home-screen web app WebKit evicts aggressively): a
  short-lived cookie there is dropped when the app is backgrounded/reaped. It is
  NOT client-side - the client is already hardened (`apps/web-nuxt/app/middleware/auth.global.ts`
  bails on a transient session-fetch error instead of redirecting to `/login`,
  and `refetchOnWindowFocus` is off).
- Users end sessions early from the connected-devices controls in `/account`
  (see [../features/connected-devices.md](../features/connected-devices.md));
  admin ban / SCIM `active:false` revoke immediately.

## Admin model

- Admins are seeded from the `NUXT_ADMIN_EMAILS` env var (comma-separated). An
  env admin is promoted to `role: 'admin'` on first admin check, so the
  better-auth `admin` plugin and `requireAdmin` agree.
- `mise run create-admin` provisions one from the CLI.
- Admin endpoints live under `apps/web-nuxt/server/api/admin/**` and always require admin.

## Passkeys (WebAuthn)

- Registering a NEW passkey is sensitive, so it is gated by a reauth step:
  `apps/web-nuxt/server/middleware/passkey-guard.ts` requires a fresh `ng_reauth` cookie
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

- `apps/web-nuxt/server/utils/crypto/envelope.ts` implements KEK -> DEK -> AES-256-GCM;
  `encrypted-adapter.ts` wraps the better-auth Drizzle adapter so
  `ssoProvider.oidcConfig` / `samlConfig` are sealed on write and opened on read.
- Requires `NUXT_SSO_KEK` (32-byte base64). Without it, provider registration
  throws. The DB column holds `{"v":1,...}` ciphertext, never the plaintext
  secret.

### OIDC discovery trust workaround

- The plugin rejects discovery URLs not in `trustedOrigins`. The admin endpoint
  (`apps/web-nuxt/server/api/admin/sso/index.post.ts`) instead fetches the IdP discovery doc
  server-side (admin-trusted), then registers with explicit
  `authorizationEndpoint` / `tokenEndpoint` / `jwksEndpoint` plus
  `oidcConfig.skipDiscovery: true` (note: `skipDiscovery` lives inside
  `oidcConfig`, not top-level). Google is OIDC with issuer
  `https://accounts.google.com`.
- A self-hosted or internal SSO IdP whose token endpoint resolves to a private
  address is refused by the plugin's SSRF guard unless its origin is trusted.
  `buildAuthOptions` (`apps/web-nuxt/lib/auth.ts`) reads `NUXT_SSO_TRUSTED_ORIGINS`
  (comma-separated, trimmed) into better-auth's `trustedOrigins` for exactly that;
  public IdPs need nothing. The SSO e2e uses it to trust its dockerized Keycloak
  (`http://keycloak:8080`).

### Identifier-first login

- Login is identifier-first: the user enters an email, `GET /api/sso/check`
  resolves the domain via `apps/web-nuxt/server/utils/auth/sso-domains.ts`, then either
  redirects through `signIn.sso({ providerId })` or reveals the password field.
- `/login?password=1` is the escape hatch for an IdP outage.
- A failed callback lands back on `/login?error=…`, which the page turns into a
  flash. Per-flow that comes from `errorCallbackURL: '/login'` on `signIn.sso`;
  when the state itself cannot be read (its `verification` row is gone after the
  10-minute TTL - slow IdP login, stale tab, replayed callback) there is no
  per-flow URL left, so `buildAuthOptions` sets `onAPIError.errorURL: '/login'`
  as the global fallback instead of better-auth's own `/api/auth/error` page.
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
- The avatar step re-fetches a token-gated IdP picture server-side with the
  user's OAuth bearer, so `isUnusableAvatarUrl`
  (`apps/web-nuxt/server/utils/auth/avatar.ts`) is an allow-list, not a hint: it
  parses the stored `user.image` and requires `https:` + host exactly
  `graph.microsoft.com`. `user.image` is client-writable through better-auth's
  update-user endpoint, so a substring match there is an SSRF that ships the
  bearer to whatever host the string names.

### Onboarding lifecycle (draft -> test -> verify -> enable)

- A provider has a `status` (`draft` / `enabled` / `disabled`) on `sso_provider`.
  The register route lands new providers as `draft`; the column default is
  `enabled` only so the `ADD COLUMN` migration grandfathers pre-existing rows.
  Only `enabled` providers are live (login resolver + `trustedProviders` +
  callback gate). Disabling is non-disruptive: existing sessions keep working
  because the catch-all gate sits only on the sign-in callback paths, never on
  session validation.
- Logic lives in the covered `apps/web-nuxt/server/utils/sso/service.ts`; the admin routes
  (`apps/web-nuxt/server/api/admin/sso/[providerId]/{status,test-connection,verify-domain,
  bypass-domain,scim-token}`) stay thin.
- **Connection test** (`testConnection`): automated checks - OIDC fetches the
  discovery endpoints + a JWKS with keys; SAML parses the X.509 cert and reaches
  the entry point. The result (`last_test_result.ok`) is the gate to enable.
- **Test sign-in** (`apps/web-nuxt/server/utils/sso/test-signin.ts`, OIDC only): a real PKCE
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

### Mobile SSO (code exchange over a verified App Link)

The native client cannot use the web flow. better-auth ends an SSO sign-in by
setting a session **cookie** and redirecting to `callbackURL` verbatim; the
`bearer()` plugin only emits `set-auth-token` on a direct API call, so a mobile
callback carries no credential at all. (Before this landed, the app read
`token`/`set-auth-token`/`session` off the callback URL - none of which can ever
be there - and silently returned false. Mobile SSO had never worked.)

The handoff, all of it in
`apps/web-nuxt/server/utils/sso/mobile-exchange.ts`:

1. The app generates two unpadded-base64url nonces, `state` and a PKCE-style
   `verifier`, and opens
   `/api/sso/mobile-authorize?providerId=&state=&challenge=<sha256(verifier)>`
   **in the browser**. That route calls `/api/auth/sign-in/sso` server-side with
   the **relative** `callbackURL`
   `/api/sso/mobile-callback?state=<state>&challenge=<sha256(verifier)>`
   (relative, so better-auth resolves it against its own baseURL and no extra
   trusted origin is needed), forwards better-auth's `Set-Cookie` to the browser,
   and 302s to the identity provider.

   **The browser has to be the one that makes the sign-in request.**
   `/sign-in/sso` returns the authorize URL and, on the same response, sets the
   signed `state` cookie its own callback later has to match. The app used to
   fetch that URL over its own HTTP client, so the cookie stayed in the app while
   the round trip happened in the browser, and every sign-in died at the callback
   on `State mismatch: State not persisted correctly` (`state_security_mismatch`,
   from `parseGenericState`) - after which `onAPIError.errorURL` dropped the user
   on `/login`. Routing the start through the browser puts the whole handshake in
   one cookie jar. Failures here redirect to the App Link with `error=sso_failed`
   so the tab closes back into the app instead of stranding it on a web page.
2. `GET /api/sso/mobile-callback` (public, unauthenticated, same exposure as
   `test-callback`) runs after better-auth created the session, so the request
   carries the session cookie. That cookie value **is** what `bearer()` hands out
   as `set-auth-token`. It hands over **only a session created in the last two
   minutes** (`isFreshSsoSession`): better-auth's SSO callback always mints a new
   session and redirects here in the same breath, so the real arrival is
   milliseconds old, while the ambient cookie of an already-signed-in browser is
   not this flow's session. Without that check the route is a CSRF that mints a
   credential - a public GET turning whatever cookie the browser carries into a
   redeemable bearer bound only to values the caller chose, which anyone who can
   make a logged-in browser follow a link and then receive the redirect (an
   unverified App Link) could redeem. PKCE does not help there, because the
   attacker supplied the challenge. The redirect origin comes from the
   configured `BETTER_AUTH_URL`, not from the request's `Host`. `parkMobileSsoToken` stores it in the `verification`
   table under `_sso-mobile-<sha256(code)>` with a **2-minute** TTL, bound to the
   state and challenge, and the route 302s to
   `<origin>/mobile/sso-callback?state=&code=` - a verified App Link / Universal
   Link, never a custom scheme. It answers with a `Location` only, so the
   reflected-XSS trap `test-callback` documents cannot apply; the reflected
   `state` is pinned to `[A-Za-z0-9_-]{16,128}` either way.
3. `POST /api/sso/mobile-exchange` (`{code, state, verifier}`) redeems it.
   `DELETE ... RETURNING` consumes the row atomically, so a replay, an expired
   code, a wrong state and a wrong verifier all fail identically (`404`, no
   oracle). Rate limited per client IP (10/min).

**The two paths in step 1 and step 2 are different on purpose**, and conflating
them is how this broke a second time. `/api/sso/mobile-callback`
is where better-auth is told to land: it is the only point that runs with the
session cookie, so it is the only point that can park a bearer.
`/mobile/sso-callback` is the App Link the app itself intercepts. Sending
better-auth straight to the App Link looks equivalent and is not - better-auth
redirects verbatim after setting the cookie, so the app receives its own `state`
and `challenge` back with no `code` and no credential, and every attempt dies on
`missing_code`. The park path is now server-side only (`MOBILE_SSO_PARK_PATH`,
built into the callbackURL by `mobileSsoParkCallback`), so the client cannot
disagree with it; what the app names is `ssoAuthorizePath` and
`ssoCallbackPath`, and `sso_test.dart` pins the requested one.

**No bearer ever rides a URL.** A URL lands in browser history, in intermediate
redirect logs, and - until App Links verification is live on the device - in an
Android intent any app registered for the host can read. The code alone would not
fix that, because whoever sees the redirect sees the code AND the state: hence
the verifier, which travels only in the exchange POST body. An observer of the
redirect therefore holds nothing redeemable.

Deep-link verification is served from
`apps/web-nuxt/server/routes/.well-known/` (`assetlinks.json.get.ts`,
`apple-app-site-association.get.ts`), built by
`apps/web-nuxt/server/utils/auth/well-known.ts` from `NUXT_ANDROID_CERT_FINGERPRINTS`
/ `NUXT_IOS_APP_IDS`. Both **404 when unset**, which is deliberate: the Android
debug keystore is a shared secret every SDK ships, so a committed debug
fingerprint would let any debug-signed app claim `goal.arzaroth.com`'s links -
strictly worse than serving nothing. See
[../features/mobile-app.md](../features/mobile-app.md) for the app side.

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

- `apps/web-nuxt/lib/auth.ts`, `apps/web-nuxt/server/api/auth/[...all].ts`
- `apps/web-nuxt/server/utils/auth-guards.ts`, `apps/web-nuxt/server/utils/validated-handler.ts`
- `apps/web-nuxt/server/plugins/warm-settings.ts`, `apps/web-nuxt/server/middleware/passkey-guard.ts`
- `apps/web-nuxt/server/utils/crypto/envelope.ts`, `apps/web-nuxt/server/utils/crypto/encrypted-adapter.ts`
- `apps/web-nuxt/server/utils/auth/sso-domains.ts`, `apps/web-nuxt/server/utils/auth/sso-guard-paths.ts`
- `apps/web-nuxt/server/utils/sso/{service,config,test-signin,mobile-exchange}.ts`, `apps/web-nuxt/server/api/admin/sso/**`
- `apps/web-nuxt/server/api/sso/{check,test-callback,mobile-authorize,mobile-callback}.get.ts`, `apps/web-nuxt/server/api/sso/mobile-exchange.post.ts`
- `apps/web-nuxt/server/utils/auth/well-known.ts`, `apps/web-nuxt/server/routes/.well-known/**`
- See [../features/sso-provisioning.md](../features/sso-provisioning.md)
- `apps/web-nuxt/db/auth-schema.ts` (`user`, `session`, `account`, `ssoProvider`, `scimProvider`, `apikey`)
