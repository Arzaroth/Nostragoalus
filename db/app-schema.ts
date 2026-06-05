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
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { user } from './auth-schema'
import type { CrowdTier, OddsTier } from '../shared/types/scoring'

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
