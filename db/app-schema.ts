import { randomUUID } from 'node:crypto'
import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { ssoProvider, user } from './auth-schema'
import type { CrowdTier, OddsTier } from '../shared/types/scoring'
import type { OddsSnapshotKind, StoredBookmakerOdds } from '../shared/types/odds'

const pk = () => text('id').primaryKey().$defaultFn(() => randomUUID())

export const stageEnum = pgEnum('stage', ['GROUP', 'R32', 'R16', 'QF', 'SF', 'THIRD_PLACE', 'FINAL'])

// Mirrors the normalized MatchStatus in shared/types/match.ts (providers map their
// own raw statuses, e.g. football-data IN_PLAY/TIMED, onto these).
export const matchStatusEnum = pgEnum('match_status', [
  'SCHEDULED',
  'LIVE',
  'PAUSED',
  'FINISHED',
  'POSTPONED',
  'CANCELLED',
  'SUSPENDED',
  'AWARDED',
])

export const matchScoringStateEnum = pgEnum('match_scoring_state', ['PENDING', 'SCORED', 'VOID', 'STALE'])

export const outcomeEnum = pgEnum('outcome', ['HOME', 'DRAW', 'AWAY'])

export const baseTierEnum = pgEnum('base_tier', ['EXACT', 'DIFF', 'OUTCOME', 'MISS'])

export const bonusSourceEnum = pgEnum('bonus_source', ['NONE', 'CROWD', 'ODDS'])

export const roundKindEnum = pgEnum('round_kind', ['GROUP_MATCHDAY', 'KNOCKOUT'])

export const userProfile = pgTable(
  'user_profile',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    cachedTotalPoints: integer('cached_total_points').notNull().default(0),
    cachedExactCount: integer('cached_exact_count').notNull().default(0),
    cachedOutcomeCount: integer('cached_outcome_count').notNull().default(0),
    cachedGdCount: integer('cached_gd_count').notNull().default(0),
    cachedRankUpdatedAt: timestamp('cached_rank_updated_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('user_profile_display_name_uq').on(sql`lower(${t.displayName})`)],
)

export const scoringConfig = pgTable(
  'scoring_config',
  {
    id: pk(),
    version: integer('version').notNull(),
    isActive: boolean('is_active').notNull().default(false),
    ptsExact: integer('pts_exact').notNull().default(3),
    ptsDiff: integer('pts_diff').notNull().default(2),
    ptsOutcome: integer('pts_outcome').notNull().default(1),
    ptsMiss: integer('pts_miss').notNull().default(0),
    jokerMultiplier: numeric('joker_multiplier', { precision: 4, scale: 2 }).notNull().default('2'),
    jokerAppliesToBonus: boolean('joker_applies_to_bonus').notNull().default(true),
    championBonus: integer('champion_bonus').notNull().default(10),
    bestScorerBonus: integer('best_scorer_bonus').notNull().default(10),
    bonusSource: bonusSourceEnum('bonus_source').notNull().default('CROWD'),
    crowdTiers: jsonb('crowd_tiers').$type<CrowdTier[]>().notNull(),
    crowdMatchBasis: text('crowd_match_basis', { enum: ['EXACT', 'OUTCOME'] }).notNull().default('EXACT'),
    crowdMinDenominator: integer('crowd_min_denominator').notNull().default(5),
    oddsTiers: jsonb('odds_tiers').$type<OddsTier[]>(),
    oddsAppliesTo: text('odds_applies_to', { enum: ['EXACT', 'OUTCOME'] }).default('OUTCOME'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('scoring_config_version_uq').on(t.version),
    uniqueIndex('scoring_config_one_active_uq').on(t.isActive).where(sql`${t.isActive} = true`),
  ],
)

export const competition = pgTable(
  'competition',
  {
    id: pk(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    provider: text('provider').notNull(),
    externalCompetitionId: text('external_competition_id').notNull(),
    externalSeasonId: text('external_season_id'),
    seasonHint: text('season_hint'),
    oddsProvider: text('odds_provider'),
    oddsProviderRef: text('odds_provider_ref'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('competition_slug_uq').on(t.slug)],
)

export const round = pgTable(
  'round',
  {
    id: pk(),
    competitionId: text('competition_id')
      .notNull()
      .references(() => competition.id, { onDelete: 'cascade' }),
    kind: roundKindEnum('kind').notNull(),
    stage: stageEnum('stage').notNull(),
    matchday: integer('matchday'),
    label: text('label').notNull(),
    sortOrder: integer('sort_order').notNull(),
    opensAt: timestamp('opens_at', { withTimezone: true }),
    firstKickoffAt: timestamp('first_kickoff_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('round_competition_sort_uq').on(t.competitionId, t.sortOrder),
    uniqueIndex('round_competition_stage_matchday_uq').on(t.competitionId, t.stage, t.matchday),
  ],
)

export const match = pgTable(
  'match',
  {
    id: pk(),
    competitionId: text('competition_id')
      .notNull()
      .references(() => competition.id, { onDelete: 'cascade' }),
    providerMatchId: text('provider_match_id').notNull(),
    roundId: text('round_id')
      .notNull()
      .references(() => round.id),
    stage: stageEnum('stage').notNull(),
    groupName: text('group_name'),
    homeTeam: text('home_team').notNull(),
    awayTeam: text('away_team').notNull(),
    homeTeamCode: text('home_team_code'),
    awayTeamCode: text('away_team_code'),
    kickoffTime: timestamp('kickoff_time', { withTimezone: true }).notNull(),
    status: matchStatusEnum('status').notNull().default('SCHEDULED'),
    fullTimeHome: integer('full_time_home'),
    fullTimeAway: integer('full_time_away'),
    halfTimeHome: integer('half_time_home'),
    halfTimeAway: integer('half_time_away'),
    extraTimeHome: integer('extra_time_home'),
    extraTimeAway: integer('extra_time_away'),
    penaltiesHome: integer('penalties_home'),
    penaltiesAway: integer('penalties_away'),
    winner: outcomeEnum('winner'),
    providerStageId: text('provider_stage_id'),
    possessionHome: numeric('possession_home', { precision: 5, scale: 2 }),
    possessionAway: numeric('possession_away', { precision: 5, scale: 2 }),
    // Odds-provider event id (e.g. Sofascore event id), resolved once by the
    // name+kickoff matcher so polling never re-matches; swapped = the provider
    // lists our away side as home, so fetched odds must be flipped.
    oddsEventRef: text('odds_event_ref'),
    oddsEventSwapped: boolean('odds_event_swapped').notNull().default(false),
    // Last odds fetch ATTEMPT (priced or not) - drives the polling cadence.
    oddsCheckedAt: timestamp('odds_checked_at', { withTimezone: true }),
    detailsFetchedAt: timestamp('details_fetched_at', { withTimezone: true }),
    scoringState: matchScoringStateEnum('scoring_state').notNull().default('PENDING'),
    scoredAtVersion: integer('scored_at_version'),
    scoredAt: timestamp('scored_at', { withTimezone: true }),
    resultHash: text('result_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('match_provider_uq').on(t.competitionId, t.providerMatchId),
    index('match_competition_idx').on(t.competitionId),
    index('match_kickoff_idx').on(t.kickoffTime),
    index('match_round_idx').on(t.roundId),
    index('match_stage_idx').on(t.stage),
    index('match_scoring_state_idx').on(t.scoringState),
  ],
)

export const goalEvent = pgTable(
  'goal_event',
  {
    id: pk(),
    matchId: text('match_id')
      .notNull()
      .references(() => match.id, { onDelete: 'cascade' }),
    competitionId: text('competition_id')
      .notNull()
      .references(() => competition.id, { onDelete: 'cascade' }),
    side: text('side', { enum: ['HOME', 'AWAY'] }).notNull(),
    teamId: text('team_id'),
    teamName: text('team_name').notNull(),
    teamCode: text('team_code'),
    playerId: text('player_id'),
    playerName: text('player_name').notNull(),
    minute: text('minute'),
    goalType: integer('goal_type'),
    ownGoal: boolean('own_goal').notNull().default(false),
    assistPlayerId: text('assist_player_id'),
    assistPlayerName: text('assist_player_name'),
  },
  (t) => [index('goal_event_competition_idx').on(t.competitionId), index('goal_event_match_idx').on(t.matchId)],
)

export const prediction = pgTable(
  'prediction',
  {
    id: pk(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    matchId: text('match_id')
      .notNull()
      .references(() => match.id, { onDelete: 'cascade' }),
    roundId: text('round_id')
      .notNull()
      .references(() => round.id),
    homeGoals: integer('home_goals').notNull(),
    awayGoals: integer('away_goals').notNull(),
    isJoker: boolean('is_joker').notNull().default(false),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    basePoints: integer('base_points'),
    baseTier: baseTierEnum('base_tier'),
    bonusPoints: integer('bonus_points'),
    bonusSource: bonusSourceEnum('bonus_source'),
    crowdShare: numeric('crowd_share', { precision: 6, scale: 5 }),
    jokerMultiplierApplied: numeric('joker_multiplier_applied', { precision: 4, scale: 2 }),
    totalPoints: integer('total_points'),
    scoredAtVersion: integer('scored_at_version'),
    scoredAt: timestamp('scored_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('prediction_user_match_uq').on(t.userId, t.matchId),
    uniqueIndex('prediction_user_round_joker_uq')
      .on(t.userId, t.roundId)
      .where(sql`${t.isJoker} = true`),
    index('prediction_match_idx').on(t.matchId),
    index('prediction_user_idx').on(t.userId),
    index('prediction_match_locked_idx').on(t.matchId, t.lockedAt),
    index('prediction_user_total_idx').on(t.userId, t.totalPoints),
  ],
)

export const championPick = pgTable(
  'champion_pick',
  {
    id: pk(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    competitionId: text('competition_id')
      .notNull()
      .references(() => competition.id, { onDelete: 'cascade' }),
    teamCode: text('team_code'),
    teamName: text('team_name').notNull(),
    awardedPoints: integer('awarded_points').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('champion_pick_user_competition_uq').on(t.userId, t.competitionId)],
)

export const bestScorerPick = pgTable(
  'best_scorer_pick',
  {
    id: pk(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    competitionId: text('competition_id')
      .notNull()
      .references(() => competition.id, { onDelete: 'cascade' }),
    playerId: text('player_id').notNull(),
    playerName: text('player_name').notNull(),
    teamCode: text('team_code'),
    teamName: text('team_name').notNull(),
    awardedPoints: integer('awarded_points').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [uniqueIndex('best_scorer_pick_user_competition_uq').on(t.userId, t.competitionId)],
)

// Append-only 1X2 odds history. POLL rows are only written pre-kickoff, so the
// latest row at/before kickoff is the closing snapshot scoring relies on;
// BACKFILL rows (finished events, retroactive providers) are stamped with the
// kickoff time itself so the same resolver finds them.
export const oddsSnapshot = pgTable(
  'odds_snapshot',
  {
    id: pk(),
    matchId: text('match_id')
      .notNull()
      .references(() => match.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerEventRef: text('provider_event_ref').notNull(),
    kind: text('kind', { enum: ['POLL', 'BACKFILL'] }).$type<OddsSnapshotKind>().notNull().default('POLL'),
    oddsHome: numeric('odds_home', { precision: 7, scale: 3 }).notNull(),
    oddsDraw: numeric('odds_draw', { precision: 7, scale: 3 }).notNull(),
    oddsAway: numeric('odds_away', { precision: 7, scale: 3 }).notNull(),
    initialHome: numeric('initial_home', { precision: 7, scale: 3 }),
    initialDraw: numeric('initial_draw', { precision: 7, scale: 3 }),
    initialAway: numeric('initial_away', { precision: 7, scale: 3 }),
    bookmakers: jsonb('bookmakers').$type<StoredBookmakerOdds[]>(),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Descending on fetched_at: latestOddsByMatch / closing-odds resolution scan
  // newest-first per match.
  (t) => [index('odds_snapshot_match_fetched_idx').on(t.matchId, t.fetchedAt.desc())],
)

export const matchScoreEvent = pgTable(
  'match_score_event',
  {
    id: pk(),
    matchId: text('match_id')
      .notNull()
      .references(() => match.id, { onDelete: 'cascade' }),
    status: matchStatusEnum('status').notNull(),
    fullTimeHome: integer('full_time_home'),
    fullTimeAway: integer('full_time_away'),
    resultHash: text('result_hash').notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('mse_match_idx').on(t.matchId)],
)

export const userProfileRelations = relations(userProfile, ({ one }) => ({
  user: one(user, { fields: [userProfile.userId], references: [user.id] }),
}))

export const competitionRelations = relations(competition, ({ many }) => ({
  rounds: many(round),
  matches: many(match),
}))

export const roundRelations = relations(round, ({ one, many }) => ({
  competition: one(competition, { fields: [round.competitionId], references: [competition.id] }),
  matches: many(match),
  predictions: many(prediction),
}))

export const matchRelations = relations(match, ({ one, many }) => ({
  competition: one(competition, { fields: [match.competitionId], references: [competition.id] }),
  round: one(round, { fields: [match.roundId], references: [round.id] }),
  predictions: many(prediction),
  scoreEvents: many(matchScoreEvent),
}))

export const predictionRelations = relations(prediction, ({ one }) => ({
  user: one(user, { fields: [prediction.userId], references: [user.id] }),
  match: one(match, { fields: [prediction.matchId], references: [match.id] }),
  round: one(round, { fields: [prediction.roundId], references: [round.id] }),
}))

export const matchScoreEventRelations = relations(matchScoreEvent, ({ one }) => ({
  match: one(match, { fields: [matchScoreEvent.matchId], references: [match.id] }),
}))

export const oddsSnapshotRelations = relations(oddsSnapshot, ({ one }) => ({
  match: one(match, { fields: [oddsSnapshot.matchId], references: [match.id] }),
}))

export const championPickRelations = relations(championPick, ({ one }) => ({
  user: one(user, { fields: [championPick.userId], references: [user.id] }),
  competition: one(competition, { fields: [championPick.competitionId], references: [competition.id] }),
}))

export const bestScorerPickRelations = relations(bestScorerPick, ({ one }) => ({
  user: one(user, { fields: [bestScorerPick.userId], references: [user.id] }),
  competition: one(competition, { fields: [bestScorerPick.competitionId], references: [competition.id] }),
}))

export const goalEventRelations = relations(goalEvent, ({ one }) => ({
  match: one(match, { fields: [goalEvent.matchId], references: [match.id] }),
  competition: one(competition, { fields: [goalEvent.competitionId], references: [competition.id] }),
}))

export const leagueRoleEnum = pgEnum('league_role', ['OWNER', 'MODERATOR', 'MEMBER'])

export const leagueVisibilityEnum = pgEnum('league_visibility', ['PRIVATE', 'PUBLIC'])

export const league = pgTable(
  'league',
  {
    id: pk(),
    competitionId: text('competition_id')
      .notNull()
      .references(() => competition.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    visibility: leagueVisibilityEnum('visibility').notNull().default('PRIVATE'),
    joinCode: text('join_code').notNull(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('league_join_code_uq').on(t.joinCode), index('league_competition_idx').on(t.competitionId)],
)

// Row exists = member. No status column: leave-memory lives in leagueOptOut so
// every membership join stays filter-free.
export const leagueMember = pgTable(
  'league_member',
  {
    leagueId: text('league_id')
      .notNull()
      .references(() => league.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: leagueRoleEnum('role').notNull().default('MEMBER'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.leagueId, t.userId] }),
    index('league_member_user_idx').on(t.userId),
    // At most one OWNER per league - makes the ownerless-league claim race-safe
    // (a second concurrent OWNER insert fails instead of creating two owners).
    uniqueIndex('league_member_one_owner_uq').on(t.leagueId).where(sql`${t.role} = 'OWNER'`),
  ],
)

// A row means "do not auto-(re)join this user to this league" (SSO auto-join).
// Written on leave/kick/admin-remove; deleted on voluntary re-join or admin add.
export const leagueOptOut = pgTable(
  'league_opt_out',
  {
    leagueId: text('league_id')
      .notNull()
      .references(() => league.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.userId] }), index('league_opt_out_user_idx').on(t.userId)],
)

// SSO provider <-> league auto-join links. Same league may hang off several
// providers; references the stable human providerId key, not the row id.
export const ssoProviderLeague = pgTable(
  'sso_provider_league',
  {
    providerId: text('provider_id')
      .notNull()
      .references(() => ssoProvider.providerId, { onDelete: 'cascade' }),
    leagueId: text('league_id')
      .notNull()
      .references(() => league.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.providerId, t.leagueId] })],
)

// Per-league rank snapshots, mirroring leaderboardRank: refreshed during
// finalize, previous rank kept so league boards can show movement arrows.
// Ranks cover the full member set (private profiles included).
export const leagueLeaderboardRank = pgTable(
  'league_leaderboard_rank',
  {
    leagueId: text('league_id')
      .notNull()
      .references(() => league.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    rank: integer('rank').notNull(),
    prevRank: integer('prev_rank'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.userId] }), index('league_leaderboard_rank_user_idx').on(t.userId)],
)

export const leagueRelations = relations(league, ({ one, many }) => ({
  competition: one(competition, { fields: [league.competitionId], references: [competition.id] }),
  members: many(leagueMember),
}))

export const leagueMemberRelations = relations(leagueMember, ({ one }) => ({
  league: one(league, { fields: [leagueMember.leagueId], references: [league.id] }),
  user: one(user, { fields: [leagueMember.userId], references: [user.id] }),
}))

// Last run / last failure per background task, for the admin dashboard.
export const taskRun = pgTable('task_run', {
  taskName: text('task_name').primaryKey(),
  lastRunAt: timestamp('last_run_at'),
  lastDurationMs: integer('last_duration_ms'),
  lastResult: text('last_result'),
  lastFailureAt: timestamp('last_failure_at'),
  lastError: text('last_error'),
})

// Rank snapshot per user+competition: when a rank changes during finalize, the
// previous one is kept so the leaderboard can show movement arrows.
export const leaderboardRank = pgTable(
  'leaderboard_rank',
  {
    competitionId: text('competition_id')
      .notNull()
      .references(() => competition.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    rank: integer('rank').notNull(),
    prevRank: integer('prev_rank'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.competitionId, t.userId] })],
)

