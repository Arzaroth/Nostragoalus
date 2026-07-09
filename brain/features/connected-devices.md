# Connected devices

A "Connected devices" section on `/account` (`app/pages/account.vue`) lets a user
see every session currently signed in to their account and sign out the ones they
don't recognise. It doubles as the diagnostic surface for spurious-logout reports
(see the session-lifetime note in [../architecture/auth.md](../architecture/auth.md)).

## How it works

- Backed by better-auth's built-in session endpoints (no plugin needed), reachable
  through the auth catch-all `server/api/auth/[...all].ts`:
  - `list-sessions` -> the caller's own active sessions (`id`, `token`,
    `ipAddress?`, `userAgent?`, `createdAt`, `updatedAt`, `expiresAt`).
  - `revoke-session` (body `{ token }`) -> drop one session.
  - `revoke-other-sessions` -> drop every session except the current one.
- `app/composables/useSessions.ts` wraps those client methods in vue-query: a
  `['sessions']` query plus `revoke` / `revokeOthers` mutations that invalidate it.
  better-auth calls resolve to `{ data, error }`; the composable rethrows `error`
  so vue-query drives `isPending`/`isError`.
- The current session is identified by matching each row's `token` against
  `session.data.session.token` from `authClient.useSession()`. That row is badged
  "This device", sorted first, and shows **no** revoke button - so a user can never
  sign themselves out from this list. "Sign out all other devices" is disabled when
  no other device exists.
- `app/utils/user-agent.ts` (`parseUserAgent` / `deviceLabel`) turns the stored
  User-Agent into a friendly label ("iPhone - Safari") and a device-kind icon. It
  is a deliberately small OS/browser bucketer, not a full UA database, and is unit
  tested (it lives in the coverage-gated `app/utils`).

## Notes

- The `session` table already stored `ipAddress` / `userAgent` (better-auth
  default); this feature only surfaces them.
- Admin ban / SCIM `active:false` revoke sessions server-side too (see
  [../architecture/auth.md](../architecture/auth.md)); this is the self-service path.
- Changing the password still revokes other sessions (`revokeOtherSessions: true`
  on `changePassword`) independently of this section.

## Sources

- `app/pages/account.vue`, `app/composables/useSessions.ts`, `app/utils/user-agent.ts`
- `tests/e2e/sessions.e2e.ts`, `app/utils/user-agent.test.ts`
- `db/auth-schema.ts` (`session.ipAddress`, `session.userAgent`)
