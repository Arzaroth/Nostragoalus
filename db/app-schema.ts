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
import type { ChampionTier, CrowdTier, OddsTier } from '#shared/types/scoring'
import type { OddsSnapshotKind, StoredBookmakerOdds } from '#shared/types/odds'
import type { NotificationData } from '#shared/types/notifications'
import type { MatchLineups } from '#shared/types/match'
import { REACTION_EMOJIS } from '#shared/reactions'

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
  'INTERRUPTED',
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
    // null = the default config that applies to every competition without an
    // override; a competition id = an override that supersedes the default for
    // that competition only.
    competitionId: text('competition_id').references(() => competition.id, { onDelete: 'cascade' }),
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
    // Optional second rarity layer: rewards a correct but rare RESULT on top of
    // the exact-score rarity above. Null = layer off (legacy behaviour).
    crowdOutcomeTiers: jsonb('crowd_outcome_tiers').$type<CrowdTier[]>(),
    crowdMatchBasis: text('crowd_match_basis', { enum: ['EXACT', 'OUTCOME'] }).notNull().default('EXACT'),
    crowdMinDenominator: integer('crowd_min_denominator').notNull().default(5),
    oddsTiers: jsonb('odds_tiers').$type<OddsTier[]>(),
    oddsAppliesTo: text('odds_applies_to', { enum: ['EXACT', 'OUTCOME'] }).default('OUTCOME'),
    championTiers: jsonb('champion_tiers').$type<ChampionTier[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('scoring_config_version_uq').on(t.version),
    // One active config per scope: at most one active default (null competition,
    // coalesced to '') and at most one active override per competition.
    uniqueIndex('scoring_config_active_scope_uq')
      .on(sql`coalesce(${t.competitionId}, '')`)
      .where(sql`${t.isActive} = true`),
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

// Admin/bot-curated watch links per match. LIVE shows around kickoff, REPLAY +
// HIGHLIGHTS once the match is FINISHED (see visibleMediaForStatus). `embeddable`
// is a nullable override: null = inherit the host-whitelist default, true/false
// = an explicit admin call (e.g. force-embed a non-whitelisted host, or demote a
// whitelisted one to an external link). `sandbox` and `allow` are nullable
// per-link iframe overrides: sandbox null = the per-trust default, true = force
// the strict player sandbox, false = emit NO sandbox attribute at all (some PPV
// hosts refuse to run sandboxed); allow null = the default feature-policy string,
// else an admin-supplied one (e.g. extracted from a pasted <iframe> tag).
export const matchMediaKindEnum = pgEnum('match_media_kind', ['LIVE', 'REPLAY', 'HIGHLIGHTS'])

export const matchMedia = pgTable(
  'match_media',
  {
    id: pk(),
    matchId: text('match_id')
      .notNull()
      .references(() => match.id, { onDelete: 'cascade' }),
    kind: matchMediaKindEnum('kind').notNull(),
    url: text('url').notNull(),
    label: text('label'),
    embeddable: boolean('embeddable'),
    sandbox: boolean('sandbox'),
    allow: text('allow'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('match_media_match_idx').on(t.matchId, t.kind)],
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

// Persisted line-ups: one row per match. The XI is immutable once confirmed, so
// a finished+available line-up is frozen and never re-fetched (notably from the
// fragile Sofascore source used to refine FIFA positions). `data` always holds a
// MatchLineups (available:false until the official XI drops).
export const matchLineups = pgTable('match_lineups', {
  matchId: text('match_id')
    .primaryKey()
    .references(() => match.id, { onDelete: 'cascade' }),
  data: jsonb('data').$type<MatchLineups>().notNull(),
  final: boolean('final').notNull().default(false),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
})

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

export const reactionEmojiEnum = pgEnum('reaction_emoji', REACTION_EMOJIS)

// One emoji reaction per user per match (changeable; clearing deletes the row).
// Aggregate counts per emoji drive the live reaction bar; league scope reuses
// leagueMember the same way crowd totals do (display only).
export const matchReaction = pgTable(
  'match_reaction',
  {
    id: pk(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    matchId: text('match_id')
      .notNull()
      .references(() => match.id, { onDelete: 'cascade' }),
    emoji: reactionEmojiEnum('emoji').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex('match_reaction_user_match_uq').on(t.userId, t.matchId),
    index('match_reaction_match_idx').on(t.matchId),
    index('match_reaction_user_idx').on(t.userId),
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
    // FIFA rank snapshotted at pick time - the payout is judged on what was
    // known when the pick was made, never recomputed as rankings move.
    fifaRank: integer('fifa_rank'),
    potentialPoints: integer('potential_points').notNull().default(10),
    awardedPoints: integer('awarded_points').notNull().default(0),
    // Second chance: set permanently the first time the pick is switched during
    // the re-pick window. Latches true (reverting doesn't clear it) and halves
    // the award. The original* columns keep the pre-switch pick for display.
    repicked: boolean('repicked').notNull().default(false),
    originalTeamCode: text('original_team_code'),
    originalTeamName: text('original_team_name'),
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
    // Second chance, mirrors champion_pick: latches true on the first switch in
    // the window, halves the award, original* keeps the pre-switch pick.
    repicked: boolean('repicked').notNull().default(false),
    originalPlayerName: text('original_player_name'),
    originalTeamCode: text('original_team_code'),
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

// Tamper-evident prediction ledger (commit-reveal). Every real change to a score
// prediction appends one immutable row: a salted commitment to the picked score,
// hash-chained to the prior entry (entryHash folds in the running head). Editing
// or dropping any past row invalidates every later entryHash, so an admin
// retro-edit is detectable by anyone holding an earlier head. The opening
// (homeGoals/awayGoals/salt) is revealed only once the match kicks off; before
// that the public sees the commitment + chain links but cannot derive the pick.
// Deliberately NO foreign keys: the ledger must outlive a deleted user or
// prediction and is never mutated, so a cascade delete would corrupt the chain.
// userId is kept for the owner's own "verify mine" lookup; the public reveal
// exposes only `subject` (sha256 of userId), never the raw id.
export const predictionCommitment = pgTable(
  'prediction_commitment',
  {
    seq: integer('seq').primaryKey(),
    predictionId: text('prediction_id').notNull(),
    userId: text('user_id').notNull(),
    subject: text('subject').notNull(),
    matchId: text('match_id').notNull(),
    homeGoals: integer('home_goals').notNull(),
    awayGoals: integer('away_goals').notNull(),
    salt: text('salt').notNull(),
    commitment: text('commitment').notNull(),
    prevHash: text('prev_hash').notNull(),
    entryHash: text('entry_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('prediction_commitment_entry_hash_uq').on(t.entryHash),
    index('prediction_commitment_match_idx').on(t.matchId),
    index('prediction_commitment_user_idx').on(t.userId),
  ],
)

// Singleton head of the commitment chain (id is always 'singleton'). Locked
// FOR UPDATE while appending so concurrent saves serialize and the chain can
// never fork; also the cheap source for the public "current head" read.
export const commitmentChainHead = pgTable('commitment_chain_head', {
  id: text('id').primaryKey(),
  seq: integer('seq').notNull(),
  headHash: text('head_hash').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})

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
  media: many(matchMedia),
  reactions: many(matchReaction),
}))

export const matchMediaRelations = relations(matchMedia, ({ one }) => ({
  match: one(match, { fields: [matchMedia.matchId], references: [match.id] }),
}))

export const predictionRelations = relations(prediction, ({ one }) => ({
  user: one(user, { fields: [prediction.userId], references: [user.id] }),
  match: one(match, { fields: [prediction.matchId], references: [match.id] }),
  round: one(round, { fields: [prediction.roundId], references: [round.id] }),
}))

export const matchScoreEventRelations = relations(matchScoreEvent, ({ one }) => ({
  match: one(match, { fields: [matchScoreEvent.matchId], references: [match.id] }),
}))

export const matchReactionRelations = relations(matchReaction, ({ one }) => ({
  user: one(user, { fields: [matchReaction.userId], references: [user.id] }),
  match: one(match, { fields: [matchReaction.matchId], references: [match.id] }),
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
    // End-to-end encrypted chat (off by default; only OWNER/MODERATOR enables,
    // behind a legal-cover warning). The server only ever stores ciphertext.
    // chatKeyEpoch 0 means never enabled; it is bumped on enable and on any
    // future re-key, tying messages and wrapped group keys to the right key.
    chatEnabled: boolean('chat_enabled').notNull().default(false),
    chatEnabledAt: timestamp('chat_enabled_at', { withTimezone: true }),
    chatEnabledBy: text('chat_enabled_by').references(() => user.id, { onDelete: 'set null' }),
    chatKeyEpoch: integer('chat_key_epoch').notNull().default(0),
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

// Shareable join links, minted by owners/moderators. Unlike the join code
// (a guessable short secret), tokens are 96-bit random and individually
// revocable, with optional expiry and a capped number of uses.
export const leagueInvite = pgTable(
  'league_invite',
  {
    id: pk(),
    leagueId: text('league_id')
      .notNull()
      .references(() => league.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    maxUses: integer('max_uses'),
    uses: integer('uses').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('league_invite_token_uq').on(t.token), index('league_invite_league_idx').on(t.leagueId)],
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
  // Total runs (success + failure) since first recorded, for the admin view.
  executions: integer('executions').notNull().default(0),
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

export const roadmapStatusEnum = pgEnum('roadmap_status', ['PLANNED', 'IN_PROGRESS', 'SHIPPED'])

// Admin-curated public roadmap entries (the /roadmap page).
export const roadmapItem = pgTable(
  'roadmap_item',
  {
    id: pk(),
    title: text('title').notNull(),
    description: text('description'),
    status: roadmapStatusEnum('status').notNull().default('PLANNED'),
    // Manual ordering within a status column; lower comes first.
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('roadmap_item_status_position_idx').on(t.status, t.position)],
)

// Generic runtime key-value settings (admin-toggled flags that must change
// without a redeploy). Values are plain strings; typed accessors live in
// server/utils/settings. Not for secrets - those go through the KEK-encrypted
// SSO config path.
export const appSetting = pgTable('app_setting', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const notificationTypeEnum = pgEnum('notification_type', [
  'LEAGUE_JOIN',
  'LEAGUE_ROLE',
  'LEAGUE_REMOVED',
  'PICK_REMINDER',
  'MATCH_RESULT',
  'CHAMPION_RESULT',
  'BEST_SCORER_RESULT',
])

// Per-user in-app notifications (the header bell). `type` mirrors `data.type`;
// the typed `data` bag carries everything the row needs to render and deep-link.
// `readAt` null = unread. `dedupeKey` makes scheduled-task triggers idempotent:
// a finalize tick re-running can't insert a second copy (partial unique index
// per user, createNotification does onConflictDoNothing).
export const userNotification = pgTable(
  'user_notification',
  {
    id: pk(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    data: jsonb('data').$type<NotificationData>().notNull(),
    dedupeKey: text('dedupe_key'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('user_notification_user_created_idx').on(t.userId, t.createdAt.desc()),
    uniqueIndex('user_notification_user_dedupe_uq')
      .on(t.userId, t.dedupeKey)
      .where(sql`${t.dedupeKey} is not null`),
  ],
)

export const userNotificationRelations = relations(userNotification, ({ one }) => ({
  user: one(user, { fields: [userNotification.userId], references: [user.id] }),
}))

// Web-push subscriptions: one row per browser/device endpoint. The endpoint is
// globally unique (a re-subscribe upserts it, reassigning to the current user);
// p256dh/auth are the encryption keys the push send needs. Dead endpoints are
// pruned when the push service returns 404/410.
export const pushSubscription = pgTable(
  'push_subscription',
  {
    id: pk(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('push_subscription_endpoint_uq').on(t.endpoint),
    index('push_subscription_user_idx').on(t.userId),
  ],
)

export const pushSubscriptionRelations = relations(pushSubscription, ({ one }) => ({
  user: one(user, { fields: [pushSubscription.userId], references: [user.id] }),
}))

// === League chat (end-to-end encrypted) ===
// The server is deliberately blind: it stores public keys, ciphertext blobs and
// sealed (wrapped) group keys, never plaintext or any key it could unwrap. All
// encryption/decryption happens client-side (see app/utils/e2ee).

// A user's chat identity keypair. The public key is readable by co-members (to
// seal the group key to them); the private key never reaches the server in the
// clear. recoveryWrappedKey is an optional escrow: the private key encrypted
// under a key derived from a generated recovery code (packed salt+nonce+ct),
// letting the user restore history on a new device. Null until they save a code.
export const chatIdentity = pgTable('chat_identity', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  publicKey: text('public_key').notNull(),
  recoveryWrappedKey: text('recovery_wrapped_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

// The per-league group key, sealed to one member's public key (libsodium sealed
// box), one row per (league, member, epoch). A member unwraps it with their
// private key to read/write that league's chat. Re-keying bumps the epoch and
// writes a fresh set of rows.
export const leagueChatKey = pgTable(
  'league_chat_key',
  {
    id: pk(),
    leagueId: text('league_id')
      .notNull()
      .references(() => league.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    epoch: integer('epoch').notNull(),
    wrappedKey: text('wrapped_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('league_chat_key_member_epoch_uq').on(t.leagueId, t.userId, t.epoch),
    index('league_chat_key_league_epoch_idx').on(t.leagueId, t.epoch),
  ],
)

// An encrypted chat message. matchId null = the league-global room; set = a
// per-match thread. The server keeps the sender id, timestamp and the key epoch
// (metadata it needs to order and route) but only ciphertext for the content
// (secretbox under the group key, packed nonce+ct).
export const chatMessage = pgTable(
  'chat_message',
  {
    id: pk(),
    leagueId: text('league_id')
      .notNull()
      .references(() => league.id, { onDelete: 'cascade' }),
    matchId: text('match_id').references(() => match.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    epoch: integer('epoch').notNull(),
    ciphertext: text('ciphertext').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('chat_message_room_idx').on(t.leagueId, t.matchId, t.createdAt),
    index('chat_message_league_idx').on(t.leagueId, t.createdAt),
  ],
)

