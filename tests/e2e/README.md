# Browser e2e (Playwright)

End-to-end specs that drive the real app in a browser, against a **running
stack** (app + db + maildev), the same way `pnpm e2e:smtp` does. They are not part
of the unit/coverage gate.

## Run

```bash
mise run dev        # or: mise run preview   (brings up app + db + maildev on :3000 / :1080)
pnpm e2e            # runs tests/e2e/*.e2e.ts (Chromium)
pnpm e2e:report     # open the last HTML report
```

Specs in the default run:

- **predict-finalize-leaderboard** - sign up (confirm via the mailed link, which
  auto-signs-in), predict an exact score, finish the match + run finalize as an
  admin, assert the leaderboard reflects the scored pick.
- **mail-flows** - forgot-password (request -> mailed link -> new password -> sign
  in) and delete-account (trigger -> mailed link -> account can no longer sign in),
  reading mail from maildev's HTTP inbox.

These seed their own namespaced data (an `e2e-cup` competition) directly in
Postgres and clean it up; they need an admin account (`verify@example.com` by
default) for finalize.

## SSO (Keycloak OIDC) - opt-in

The `sso` spec is skipped unless `E2E_SSO=1`, because it needs the Keycloak IdP up
and one app-config flag:

```bash
# 1. bring up the stack WITH Keycloak (the `e2e` compose profile):
docker compose -f compose.yaml -f compose.dev.yaml --profile dev --profile e2e up -d --wait

# 2. the app must trust the internal IdP origin (better-auth's SSO SSRF guard
#    refuses a token endpoint that resolves to a private address otherwise):
#    start the app with  NUXT_SSO_TRUSTED_ORIGINS=http://keycloak:8080
#    (read by lib/auth.ts; no effect when unset).

# 3. run:
E2E_SSO=1 pnpm e2e
```

The issuer is `http://keycloak:8080`: the app reaches Keycloak by its compose
service name, and the browser resolves `keycloak` -> 127.0.0.1 via the
`--host-resolver-rules` launch arg in `playwright.config.ts`, so one issuer URL
works for both sides of the OIDC dance (no `/etc/hosts` edit needed).

The spec registers Keycloak as an OIDC provider (admin API), marks its domain
verified, drives the login through Keycloak's form, and asserts the SSO session.
Realm (`tests/e2e/keycloak/realm-export.json`): realm `nostragoalus-e2e`, client
`nostragoalus-app` / secret `e2e-keycloak-secret`, test user `ssouser` /
`ssoPassword123` (email `ssouser@e2e-sso.test`).

## Env overrides

| var | default |
| --- | --- |
| `E2E_APP_URL` | `http://localhost:3000` |
| `E2E_MAILDEV_URL` | `http://localhost:1080` |
| `E2E_DATABASE_URL` | `postgres://nostragoalus:nostragoalus@localhost:5432/nostragoalus` |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | `verify@example.com` / `password123` |
| `E2E_KC_ISSUER` | `http://keycloak:8080/realms/nostragoalus-e2e` |
| `PLAYWRIGHT_OUTPUT_DIR` | `/tmp/ng-e2e-results` (kept out of the worktree, which the dev app-dev bind-mounts) |

## Notes

- PrimeVue inputs only register real keystrokes, so the helpers type with
  `pressSequentially`, not `.fill()`.
- Specs run serially (shared DB), output goes outside the worktree so it can't
  thrash the dev stack's file watcher.
