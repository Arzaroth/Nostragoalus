import { and, eq, lte } from 'drizzle-orm'
import type { AppDatabase } from '../../../db/types'
import { match } from '../../../db/schema'
import { oddsBonus } from '../scoring/bonus'
import { basePointsFor, classifyTier, outcomeOf, type BasePoints, type Outcome, type Scoreline } from '../scoring/tiers'
import type { OddsTier } from '../../../shared/types/scoring'
import { ConflictError } from '../errors'

export type LeagueMode = 'NORMAL' | 'EASY' | 'HARD' | 'HARDCORE'

export const LEAGUE_MODES: readonly LeagueMode[] = ['NORMAL', 'EASY', 'HARD', 'HARDCORE']

// EASY/HARDCORE score on the outcome (W/D/L) alone, so an outcome-only pick
// satisfies them. NORMAL/HARD want the real exact digits.
export function isOutcomeMode(mode: LeagueMode): boolean {
  return mode === 'EASY' || mode === 'HARDCORE'
}

export function isExactMode(mode: LeagueMode): boolean {
  return !isOutcomeMode(mode)
}

// HARD layers a confidence wager onto each pick.
export function usesWager(mode: LeagueMode): boolean {
  return mode === 'HARD'
}

// HARDCORE is last-man-standing: members carry lives and get eliminated, the
// board is survival rather than a running score.
export function usesLives(mode: LeagueMode): boolean {
  return mode === 'HARDCORE'
}

export function isEliminationMode(mode: LeagueMode): boolean {
  return mode === 'HARDCORE'
}

// The scoreline a W/D/L quick-pick is stored as. The digits are not a real
// prediction (the pick is outcome-only); they just encode the chosen result so
// outcome modes can read it and the value round-trips through the score columns.
export const CANONICAL_SCORELINE: Record<Outcome, Scoreline> = {
  HOME: { home: 1, away: 0 },
  DRAW: { home: 1, away: 1 },
  AWAY: { home: 0, away: 1 },
}

export function canonicalScoreline(outcome: Outcome): Scoreline {
  return CANONICAL_SCORELINE[outcome]
}

// A pick as a mode scorer sees it - the effective pick (override ?? base),
// stripped of the awarded columns (moded leagues re-score at read time).
export interface EffectivePick {
  home: number
  away: number
  isOutcomeOnly: boolean
  wager: number | null
  isJoker: boolean
}

// Competition-level knobs a per-mode scorer needs, taken from the active
// scoring rules so NORMAL overrides match the live config.
export interface ModeScoreContext {
  base: BasePoints
  jokerMultiplier: number
  oddsTiers: OddsTier[] | null
}

// A correct EASY call is always worth at least this, with the configured odds
// tiers stacked on top so longshots pay more. Keeps a correct favourite from
// scoring zero (the odds tiers alone pay nothing below their lowest bound).
export const EASY_CORRECT_BASE = 1

// Nailing the exact score in HARD pays the stake a second time.
export const HARD_EXACT_MULTIPLIER = 2

// Fixed confidence budget per round = matches in the round x this. Not
// owner-configurable in v1 (the wager rides the shared base pick, so it must be
// consistent across all a member's HARD leagues). Per-league budgets are
// deferred (see TODO.md).
export const HARD_BUDGET_PER_MATCH = 3

export function hardRoundBudget(matchesInRound: number): number {
  return Math.max(0, matchesInRound) * HARD_BUDGET_PER_MATCH
}

export function predictedOutcomeMatches(pick: Pick<EffectivePick, 'home' | 'away'>, actual: Scoreline): boolean {
  return outcomeOf({ home: pick.home, away: pick.away }) === outcomeOf(actual)
}

// EASY: a correct outcome pays a flat base plus an odds bonus (longshots pay
// more); a wrong outcome pays nothing. Joker doubles the lot.
export function easyPoints(pick: EffectivePick, actual: Scoreline, actualOutcomeOdds: number | null, ctx: ModeScoreContext): number {
  if (!predictedOutcomeMatches(pick, actual)) return 0
  const pts = EASY_CORRECT_BASE + oddsBonus(true, actualOutcomeOdds, ctx.oddsTiers)
  return pick.isJoker ? pts * ctx.jokerMultiplier : pts
}

// HARD: a correct outcome pays your stake; nailing the exact score pays it
// again. A wrong outcome (or no stake) pays nothing. No joker, no odds layer -
// the stake is the risk lever.
export function hardPoints(pick: EffectivePick, actual: Scoreline): number {
  const stake = pick.wager ?? 0
  if (stake <= 0) return 0
  if (!predictedOutcomeMatches(pick, actual)) return 0
  const exact = pick.home === actual.home && pick.away === actual.away
  return exact ? stake * HARD_EXACT_MULTIPLIER : stake
}

// NORMAL re-score, used only for members who hold a league override (a synced
// member keeps the engine's stored total, which already carries the crowd/odds
// bonus). An override is scored on the base tier alone - it forfeits the global
// crowd-rarity bonus, which has no per-league meaning. See TODO.md.
export function normalPoints(pick: EffectivePick, actual: Scoreline, ctx: ModeScoreContext): number {
  const pts = basePointsFor(classifyTier({ home: pick.home, away: pick.away }, actual), ctx.base)
  return pick.isJoker ? pts * ctx.jokerMultiplier : pts
}

// Read-time points for a moded league (or a NORMAL league override). HARDCORE
// carries no points - its board is survival, built separately.
export function modePoints(
  mode: LeagueMode,
  pick: EffectivePick,
  actual: Scoreline,
  actualOutcomeOdds: number | null,
  ctx: ModeScoreContext,
): number {
  switch (mode) {
    case 'EASY':
      return easyPoints(pick, actual, actualOutcomeOdds, ctx)
    case 'HARD':
      return hardPoints(pick, actual)
    case 'NORMAL':
      return normalPoints(pick, actual, ctx)
    case 'HARDCORE':
      return 0
  }
}

// HARDCORE survival of a single pick: a present pick with the correct outcome
// survives; a missing pick or a wrong outcome burns a life.
export function hardcoreSurvives(pick: EffectivePick | null | undefined, actual: Scoreline): boolean {
  if (!pick) return false
  return predictedOutcomeMatches(pick, actual)
}

// A competition is "running" once its earliest match has kicked off. League mode
// is frozen from that point (no create-in-mode, no swap) so the game can't shift
// under players mid-tournament.
export async function competitionIsRunning(db: AppDatabase, competitionId: string, now: Date = new Date()): Promise<boolean> {
  const [row] = await db
    .select({ id: match.id })
    .from(match)
    .where(and(eq(match.competitionId, competitionId), lte(match.kickoffTime, now)))
    .limit(1)
  return row != null
}

export async function assertCompetitionNotRunning(db: AppDatabase, competitionId: string, now?: Date): Promise<void> {
  if (await competitionIsRunning(db, competitionId, now)) {
    throw new ConflictError('competition has already started; league mode is locked')
  }
}
