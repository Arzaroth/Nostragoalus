# Database

Postgres 17 via Drizzle ORM (`drizzle-orm/node-postgres`). The schema is the
source of truth; migrations are generated, never hand-written.

## Files and connection

- `db/index.ts` - one `pg.Pool` + `drizzle(pool, { schema })`. Connection from
  `DATABASE_URL ?? NUXT_DATABASE_URL`. Exports the singleton `db`.
- `db/schema.ts` - re-exports `auth-schema.ts` + `app-schema.ts`.
- `db/auth-schema.ts` - better-auth tables (`user`, `session`, `account`,
  `verification`, `sso_provider`, `apikey`). See [auth.md](auth.md).
- `db/app-schema.ts` - all product tables, enums, and Drizzle relations.
- `db/types.ts` - `AppDatabase = PgDatabase<...>`, the type every service takes.
- `drizzle.config.ts` - dialect postgresql, schema `./db/schema.ts`, out
  `./drizzle`.

## Migrations

- Generate with `pnpm db:generate` (drizzle-kit) into `drizzle/NNNN_name.sql`
  plus the journal/snapshot. Currently ~47 migrations (0000 onward).
- Applied on boot by `server/plugins/migrate.ts` when `RUN_MIGRATIONS=true`.
- **Shared-dev-DB caveat:** the local `nostragoalus_pgdata` volume is shared
  across all worktrees/branches, and the node-postgres migrator applies journal
  entries by `when` timestamp, not by hash. If a parallel branch applied a
  newer-timestamped migration, your older-timestamped one is treated as "already
  past" and SKIPPED, so its columns never get created (symptom: `column ... does
  not exist`, 500 on login). Fix: rebase onto current master and regenerate the
  migration (fresh timestamp). A fresh prod DB is unaffected (empty journal,
  everything applies in order). See [decisions.md](../decisions.md).

## Table groups

Logical names are the Drizzle TS exports; the SQL tables are snake_case
(`chatMessage` -> `chat_message`). Full column lists live in `db/app-schema.ts`.

- **Auth:** `user`, `session`, `account`, `verification`, `sso_provider`
  (lifecycle `status` + `last_tested_at`/`last_test_result` + `domainVerified`),
  `scim_provider` (per-provider hashed SCIM token), `apikey`. `user` carries app
  additionalFields (push* toggles, profilePrivate, skin/skinsUnlocked). See
  [auth.md](auth.md) and [../features/sso-provisioning.md](../features/sso-provisioning.md).
- **Competition core:** `competition`, `round` (kind, stage, kickoffAt), `match`
  (status, fullTimeScore), `goal_event` (side, player, minute, ownGoal). See
  [../features/competitions.md](../features/competitions.md).
- **Predictions / scoring:** `prediction` (homeGoals, awayGoals, isJoker,
  lockedAt, awardedPoints, baseResult, bonusSource, bonusPoints),
  `match_score_event` (the derive-don't-mutate scoring snapshot),
  `scoring_config` (versioned jsonb tiers), `champion_pick`, `best_scorer_pick`,
  `odds_snapshot`, `match_reaction`. See
  [../features/predictions-and-scoring.md](../features/predictions-and-scoring.md).
- **Tamper-evidence:** `prediction_commitment` (append-only, no FKs),
  `commitment_chain_head` (singleton). See
  [../features/tamper-evidence.md](../features/tamper-evidence.md).
- **Leagues:** `league`, `league_member` (role), `league_opt_out`,
  `league_invite` (sso provider link), `league_leaderboard_rank`. See
  [../features/leagues.md](../features/leagues.md).
- **Chat (E2E):** `chat_message`, `chat_attachment` (ciphertext XOR storage_key),
  `chat_identity`, `league_chat_key`, `chat_room_read` (per-room unread marker),
  plus moderation tables. See [../features/chat.md](../features/chat.md).
- **Notifications / push:** `user_notification` (typed jsonb + dedupeKey),
  `push_subscription`. See [../features/notifications.md](../features/notifications.md).
- **Media / settings:** `match_media`, `app_setting`, `user_profile`.

## Enums

`base_tier` (EXACT/DIFF/OUTCOME/MISS), `bonus_source` (NONE/CROWD/ODDS),
`outcome` (HOME/DRAW/AWAY), `round_kind` (GROUP_MATCHDAY/KNOCKOUT), `stage`
(GROUP/R32/R16/QF/SF/THIRD_PLACE/FINAL), `match_status`
(SCHEDULED/LIVE/PAUSED/FINISHED/POSTPONED/CANCELLED/SUSPENDED/AWARDED),
`match_scoring_state` (PENDING/SCORED/VOID/STALE), `league_role`
(OWNER/MODERATOR/MEMBER), `league_visibility` (PRIVATE/PUBLIC),
`chat_moderation_state` (VISIBLE/PENDING/REMOVED), `notification_type` (8 values:
LEAGUE_JOIN, LEAGUE_ROLE, LEAGUE_REMOVED, PICK_REMINDER, MATCH_RESULT,
CHAMPION_RESULT, BEST_SCORER_RESULT, CHAT_MENTION),
`match_media_kind` (LIVE/REPLAY/HIGHLIGHTS),
`roadmap_status` (PLANNED/IN_PROGRESS/SHIPPED/SUGGESTED),
`roadmap_moderation` (PENDING/APPROVED/REJECTED), `sso_provider_status`
(draft/enabled/disabled).

All foreign keys use ON DELETE CASCADE, except the tamper-evidence ledger which
deliberately has none (it must outlive deleted rows).

## Test database

- `tests/db.ts` `createTestDb()` spins up `@electric-sql/pglite` (in-memory
  Postgres) and runs the REAL `./drizzle` migrations, so service tests exercise
  production schema. See [testing.md](testing.md).
- `tests/factories.ts` - `makeUser`, `makeCompetition`, `makeRound`, `makeMatch`,
  `makePrediction`, `makeLeague`, `addLeagueMember`, `makeReaction`.
- `tests/storage.ts` - `memoryStorage()` injected where a service needs a blob
  driver.

## Sources

- `db/index.ts`, `db/schema.ts`, `db/auth-schema.ts`, `db/app-schema.ts`, `db/types.ts`
- `drizzle.config.ts`, `drizzle/`, `server/plugins/migrate.ts`
- `tests/db.ts`, `tests/factories.ts`, `tests/storage.ts`
