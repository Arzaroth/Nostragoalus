// Shared vocabulary for Tournament Wrapped - the post-final personal recap.
// The server aggregation (server/utils/wrapped/service.ts) fills these DTOs;
// the client renders them as the slide deck and the share card.

import type { CompetitionAwardType, AchievementTier } from './achievements'
import type { ReactionEmoji } from '../reactions'

// One prediction surfaced on a slide (best pick, worst joker, rarest call...).
export interface WrappedPickDto {
  matchId: string
  homeTeam: string
  awayTeam: string
  homeTeamCode: string | null
  awayTeamCode: string | null
  roundLabel: string
  kickoffTime: string
  predHome: number
  predAway: number
  actualHome: number | null
  actualAway: number | null
  tier: string | null
  totalPoints: number
  bonusPoints: number
  isJoker: boolean
  // Integer percent of the field that called this exact score, null when unscored.
  crowdSharePct: number | null
}

// One point of the rank-over-time journey: the user's standing once every
// scored match of that round was settled (replayed, not snapshotted).
export interface WrappedJourneyPointDto {
  roundLabel: string
  sortOrder: number
  rank: number
  players: number
  points: number
}

export interface WrappedDto {
  ready: true
  competitionName: string
  displayName: string
  image: string | null
  totals: {
    totalPoints: number
    predictionPoints: number
    championPoints: number
    bestScorerPoints: number
    rank: number | null
    players: number
    // "top N%" of the ranked population, 1..100; null when unranked.
    topPercent: number | null
  }
  tiers: {
    exact: number
    diff: number
    outcome: number
    miss: number
    predictions: number
    scoredMatches: number
    completionPct: number
  }
  streaks: {
    exactStreak: number
    scoringStreak: number
    perfectRounds: number
  }
  bestPick: WrappedPickDto | null
  // The scored MISS where the largest share of the field nailed the exact
  // score - the one that got away.
  biggestMiss: (WrappedPickDto & { fieldExactPct: number }) | null
  jokers: {
    played: number
    points: number
    best: WrappedPickDto | null
  }
  crowd: {
    bonusPoints: number
    biggestBonus: WrappedPickDto | null
    loneWolf: number
  }
  meta: {
    champion: { teamCode: string | null; teamName: string; points: number; hit: boolean } | null
    bestScorer: { playerName: string; teamCode: string | null; points: number; hit: boolean } | null
  }
  chat: {
    messages: number
    reactionsGiven: number
    reactionsReceived: number
    topEmoji: ReactionEmoji | null
  }
  haul: {
    trophies: { type: CompetitionAwardType; value: number; teamCode: string | null }[]
    badges: { key: string; tier: AchievementTier | null }[]
  }
  journey: WrappedJourneyPointDto[]
}

// Pre-final the recap is a teaser, not an error: the page shows a locked state.
export interface WrappedNotReadyDto {
  ready: false
  competitionName: string
}

export type WrappedResponse = WrappedDto | WrappedNotReadyDto
