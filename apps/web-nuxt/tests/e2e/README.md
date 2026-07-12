# Browser e2e (Playwright)

End-to-end specs that drive the real app in a browser. They run against an
**isolated, disposable stack** so they never touch your dev database. Not part of
the unit/coverage gate.

## Run

```bash
mise run e2e          # brings up the isolated stack (if needed) + runs all specs
mise run e2e-down     # tear the stack down and drop its DB volume
pnpm e2e:report       # open the last HTML report
```

`mise run e2e` brings up a separate compose project (`ng-e2e`) with its **own**
Postgres, maildev and Keycloak on shifted ports, so it coexists with `mise run
dev` and leaves the dev DB alone:

| service | dev stack | e2e stack |
| --- | --- | --- |
| app | :3000 | :3100 |
| postgres | :5432 | :5433 |
| maildev | :1080 | :1081 |
| keycloak | - | :8080 |

The e2e Postgres is a fresh volume each time it's created, so the suite starts
from an empty, migrated DB. `tests/e2e/global-setup.ts` ensures the admin account
exists (nothing else creates it); each spec seeds its own namespaced data and
cleans up. `mise run e2e-down` drops the volume for a truly clean slate.

## Specs

- **predict-finalize-leaderboard** - sign up, predict an exact score, finish the
  match + run finalize as admin, assert the leaderboard reflects the scored pick.
- **mail-flows** - forgot-password and delete-account, end to end via maildev.
- **sso** - register the dockerized Keycloak as an OIDC provider, drive its login
  form, assert the SSO session. Gated on `E2E_SSO=1` (set in `.env.e2e`). The
  issuer is `http://keycloak:8080`: the app reaches Keycloak by compose service
  name, the browser resolves `keycloak` -> 127.0.0.1 via `--host-resolver-rules`,
  so one URL serves both sides. The app trusts that internal origin via
  `NUXT_SSO_TRUSTED_ORIGINS` (set on the e2e app in `compose.dev.yaml`). Realm:
  `tests/e2e/keycloak/realm-export.json` (client `nostragoalus-app` /
  `e2e-keycloak-secret`, user `ssouser` / `ssoPassword123`).

## Config (`.env.e2e`)

`playwright.config.ts` loads `.env.e2e` (no secrets - just where the e2e stack
lives), unless a var is already set, so the suite targets the isolated stack by
default. Override any `E2E_*` to point at another stack:

| var | `.env.e2e` |
| --- | --- |
| `E2E_APP_URL` | `http://localhost:3100` |
| `E2E_MAILDEV_URL` | `http://localhost:1081` |
| `E2E_DATABASE_URL` | `...@localhost:5433/nostragoalus` |
| `E2E_KC_ISSUER` | `http://keycloak:8080/realms/nostragoalus-e2e` |
| `E2E_SSO` | `1` |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | `verify@example.com` / a strong password (a fresh DB rejects breached ones) |
| `PLAYWRIGHT_OUTPUT_DIR` | `/tmp/ng-e2e-results` (kept out of the worktree, which app-dev bind-mounts) |

To run against an already-running stack instead (e.g. `mise run dev` on :3000),
set the `E2E_*` vars yourself and `E2E_SSO=` to skip SSO (no Keycloak there).

## Notes

- PrimeVue inputs only register real keystrokes, so the helpers type with
  `pressSequentially`, not `.fill()`.
- The signup helper handles both email-verification states (off: signed in
  immediately; on: confirm via the mailed link).
- Specs run serially (shared DB), output goes outside the worktree so it can't
  thrash a stack's file watcher.
