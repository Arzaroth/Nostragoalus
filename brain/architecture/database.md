# Database

Postgres 17 via Drizzle ORM (`drizzle-orm/node-postgres`). The schema is the
source of truth; migrations are generated, never hand-written.

## Files and connection

- `apps/web-nuxt/db/index.ts` - one `pg.Pool` + `drizzle(pool, { schema })`. Connection from
  `DATABASE_URL ?? NUXT_DATABASE_URL`. Exports the singleton `db`.
- `apps/web-nuxt/db/schema.ts` - re-exports `auth-schema.ts` + `app-schema.ts`.
- `apps/web-nuxt/db/auth-schema.ts` - better-auth tables (`user`, `session`, `account`,
  `verification`, `passkey`, `two_factor`, `sso_provider`, `scim_provider`,
  `apikey`). See [auth.md](auth.md).
- `apps/web-nuxt/db/app-schema.ts` - all product tables, enums, and Drizzle relations.
- `apps/web-nuxt/db/types.ts` - `AppDatabase = PgDatabase<...>`, the type every service takes.
- `apps/web-nuxt/drizzle.config.ts` - dialect postgresql, schema `./db/schema.ts`, out
  `./drizzle`.

## Migrations

- Generate with `pnpm db:generate` (drizzle-kit) into `apps/web-nuxt/drizzle/NNNN_name.sql`
  plus the journal/snapshot. Currently ~55 migrations (0000 through 0054).
- Applied on boot by `apps/web-nuxt/server/plugins/migrate.ts` when `RUN_MIGRATIONS=true`.
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
(`chatMessage` -> `chat_message`). Full column lists live in `apps/web-nuxt/db/app-schema.ts`.

- **Auth:** `user`, `session`, `account`, `verification`, `passkey`, `two_factor`,
  `sso_provider` (lifecycle `status` + `last_tested_at`/`last_test_result` +
  `domainVerified`), `scim_provider` (per-provider hashed SCIM token), `apikey`.
  `user` carries app additionalFields (push* toggles, profilePrivate,
  skin/skinsUnlocked, hiddenFromLeaderboard). See
  [auth.md](auth.md) and [../features/sso-provisioning.md](../features/sso-provisioning.md).
- **Competition core:** `competition`, `round` (kind, stage, kickoffAt), `match`
  (status, fullTimeScore), `goal_event` (side, player, minute, ownGoal),
  `match_lineups` (frozen official XI, never re-fetched once final). See
  [../features/competitions.md](../features/competitions.md).
- **Predictions / scoring:** `prediction` (homeGoals, awayGoals, isJoker,
  lockedAt, awardedPoints, baseResult, bonusSource, bonusPoints),
  `match_score_event` (the derive-don't-mutate scoring snapshot),
  `scoring_config` (versioned jsonb tiers), `champion_pick`, `best_scorer_pick`,
  `odds_snapshot`, `match_reaction`, `leaderboard_rank` (per-competition rank
  snapshot keeping prevRank for movement arrows). See
  [../features/predictions-and-scoring.md](../features/predictions-and-scoring.md).
- **Tamper-evidence:** `prediction_commitment` (append-only, no FKs),
  `commitment_chain_head` (singleton). See
  [../features/tamper-evidence.md](../features/tamper-evidence.md).
- **Achievements / awards:** `competition_award` (derived end-of-competition
  awards, typed `competition_award_type`), `user_achievement` (trophy cabinet;
  catalog lives in code, competitionId null for GLOBAL badges), `showcase_pin`
  (achievements a user pins to display per competition). See
  [../features/achievements.md](../features/achievements.md).
- **Leagues:** `league`, `league_reward` (owner-set prizes; winners derived at
  read time), `league_member` (role), `league_invite` (revocable join-link
  tokens), `league_opt_out`, `sso_provider_league` (SSO provider -> league
  auto-join links, keyed by providerId), `league_leaderboard_rank`. See
  [../features/leagues.md](../features/leagues.md).
- **Chat (E2E):** `chat_message`, `chat_attachment` (ciphertext XOR storage_key),
  `chat_identity`, `league_chat_key`, `chat_room_read` (per-room unread marker),
  `chat_message_reaction` (plaintext emoji per member), `chat_message_report`
  (member reports; enough flip a message to PENDING). See
  [../features/chat.md](../features/chat.md).
- **Notifications / push:** `user_notification` (typed jsonb + dedupeKey),
  `push_subscription`. See [../features/notifications.md](../features/notifications.md).
- **Roadmap:** `roadmap_item` (admin entries + user suggestions, one table two
  views via status/moderation), `roadmap_vote` (one upvote per user, counts
  derived). See [../features/roadmap.md](../features/roadmap.md).
- **Media / settings / ops:** `match_media`, `app_setting`, `user_profile`,
  `task_run` (last run/failure per background task, for the admin dashboard).

## Enums

`base_tier` (EXACT/DIFF/OUTCOME/MISS), `bonus_source` (NONE/CROWD/ODDS),
`outcome` (HOME/DRAW/AWAY), `round_kind` (GROUP_MATCHDAY/KNOCKOUT), `stage`
(GROUP/R32/R16/QF/SF/THIRD_PLACE/FINAL), `match_status`
(SCHEDULED/LIVE/PAUSED/FINISHED/POSTPONED/CANCELLED/SUSPENDED/AWARDED/INTERRUPTED),
`match_scoring_state` (PENDING/SCORED/VOID/STALE), `league_role`
(OWNER/MODERATOR/MEMBER), `league_visibility` (PRIVATE/PUBLIC),
`chat_moderation_state` (VISIBLE/PENDING/REMOVED), `notification_type` (10 values:
LEAGUE_JOIN, LEAGUE_ROLE, LEAGUE_REMOVED, PICK_REMINDER, MATCH_RESULT,
CHAMPION_RESULT, BEST_SCORER_RESULT, TROPHY_AWARDED, ACHIEVEMENT_UNLOCKED,
CHAT_MENTION), `match_media_kind` (LIVE/REPLAY/HIGHLIGHTS),
`competition_award_type` (OVERALL/GROUP_PHASE/KNOCKOUT_PHASE/MADAME_IRMA/TEAM_SPECIALIST),
`achievement_tier` (BRONZE/SILVER/GOLD/DIAMOND),
`roadmap_status` (PLANNED/IN_PROGRESS/SHIPPED/SUGGESTED),
`roadmap_moderation` (PENDING/APPROVED/REJECTED), `sso_provider_status`
(draft/enabled/disabled).

All foreign keys use ON DELETE CASCADE, except the tamper-evidence ledger which
deliberately has none (it must outlive deleted rows).

## Test database

- `apps/web-nuxt/tests/db.ts` `createTestDb()` spins up `@electric-sql/pglite` (in-memory
  Postgres) and runs the REAL `./drizzle` migrations, so service tests exercise
  production schema. See [testing.md](testing.md).
- `apps/web-nuxt/tests/factories.ts` - `makeUser`, `makeCompetition`, `seedCompetition`,
  `makeMatch`, `makeLeague`, `addLeagueMember`, `makePrediction`, `makeReaction`.
- `apps/web-nuxt/tests/storage.ts` - `memoryStorage()` injected where a service needs a blob
  driver.

## Sources

- `apps/web-nuxt/db/index.ts`, `apps/web-nuxt/db/schema.ts`, `apps/web-nuxt/db/auth-schema.ts`, `apps/web-nuxt/db/app-schema.ts`, `apps/web-nuxt/db/types.ts`
- `apps/web-nuxt/drizzle.config.ts`, `apps/web-nuxt/drizzle/`, `apps/web-nuxt/server/plugins/migrate.ts`
- `apps/web-nuxt/tests/db.ts`, `apps/web-nuxt/tests/factories.ts`, `apps/web-nuxt/tests/storage.ts`
