import type { AchievementTier } from '#shared/types/achievements'

// The achievement catalog lives in code (not the DB): the badges a user can earn,
// their grading thresholds, and how they present. user_achievement rows only
// record which of these a user has unlocked. See brain/features/achievements.md.

export type AchievementCategory =
  | 'MILESTONE'
  | 'BEHAVIORAL'
  | 'CROWD'
  | 'JOKER'
  | 'ORACLE'
  | 'STREAK'
  | 'TROPHY_META'
  | 'SECRET'

// COMPETITION badges are earned per competition; GLOBAL ones span all of them
// (their user_achievement row has a null competitionId).
export type AchievementScope = 'COMPETITION' | 'GLOBAL'

// The per-user metrics a batch evaluation derives from the settled prediction
// state. Every stat-driven achievement grades one of these.
export const ACHIEVEMENT_METRICS = [
  'predictions', // total predictions made
  'exact', // EXACT scorelines
  'points', // total prediction points
  'crowdHits', // predictions that earned a rarity/odds bonus (went against the grain)
  'jokerExact', // jokers that landed EXACT
  'earlyBird', // predictions saved >24h before kickoff
  'nightOwl', // predictions saved in the small hours (00:00-03:59 UTC)
  'deadlineDancer', // predictions saved in the last 5 minutes before kickoff
  'exactStreak', // longest run of consecutive EXACT predictions
  'scoringStreak', // longest run of consecutive non-MISS predictions
  'perfectRounds', // rounds where every scored pick was EXACT (and none missing)
  'completed', // 1 = predicted every finished match of the competition
  'championOracle', // 1 = champion pick paid out
  'goldenTouch', // 1 = best-scorer (Golden Boot) pick paid out
  'underdog', // 1 = a champion pick ranked 41+ (or unranked) that won
  'loneWolf', // matches where this user was the only EXACT
  'trophies', // competition-end trophies held
  'podium', // 1 = finished top 3 overall
] as const

export type AchievementMetric = (typeof ACHIEVEMENT_METRICS)[number]
export type UserAchievementStats = Record<AchievementMetric, number>

export interface AchievementTierThreshold {
  tier: AchievementTier
  threshold: number
}

export interface AchievementDef {
  key: string
  category: AchievementCategory
  scope: AchievementScope
  // Which metric grades it. Absent = not batch-evaluated (granted by an event,
  // e.g. the secret pony unlock).
  metric?: AchievementMetric
  // Ascending thresholds. A single-shot badge has one BRONZE entry.
  tiers: AchievementTierThreshold[]
  // Hidden until earned: other users never see it locked, and the owner sees only
  // a cryptic teaser. Used for the secret badges.
  hidden?: boolean
}

const single = (threshold = 1): AchievementTierThreshold[] => [{ tier: 'BRONZE', threshold }]
const graded = (b: number, s: number, g: number): AchievementTierThreshold[] => [
  { tier: 'BRONZE', threshold: b },
  { tier: 'SILVER', threshold: s },
  { tier: 'GOLD', threshold: g },
]

// The batch-evaluated catalog (everything except event-granted secrets).
export const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'first-blood', category: 'MILESTONE', scope: 'COMPETITION', metric: 'exact', tiers: single(1) },
  { key: 'sharpshooter', category: 'MILESTONE', scope: 'COMPETITION', metric: 'exact', tiers: graded(5, 15, 30) },
  { key: 'prophet', category: 'MILESTONE', scope: 'COMPETITION', metric: 'predictions', tiers: graded(10, 50, 100) },
  { key: 'century', category: 'MILESTONE', scope: 'COMPETITION', metric: 'points', tiers: graded(100, 250, 500) },
  { key: 'perfect-round', category: 'MILESTONE', scope: 'COMPETITION', metric: 'perfectRounds', tiers: single(1) },
  { key: 'hot-streak', category: 'STREAK', scope: 'COMPETITION', metric: 'exactStreak', tiers: graded(3, 5, 8) },
  { key: 'on-fire', category: 'STREAK', scope: 'COMPETITION', metric: 'scoringStreak', tiers: graded(5, 10, 15) },
  { key: 'contrarian', category: 'CROWD', scope: 'COMPETITION', metric: 'crowdHits', tiers: graded(5, 15, 30) },
  { key: 'lone-wolf', category: 'CROWD', scope: 'COMPETITION', metric: 'loneWolf', tiers: single(1) },
  { key: 'joker-hero', category: 'JOKER', scope: 'COMPETITION', metric: 'jokerExact', tiers: graded(1, 3, 5) },
  { key: 'early-bird', category: 'BEHAVIORAL', scope: 'COMPETITION', metric: 'earlyBird', tiers: graded(1, 10, 25) },
  { key: 'night-owl', category: 'BEHAVIORAL', scope: 'COMPETITION', metric: 'nightOwl', tiers: single(1) },
  { key: 'deadline-dancer', category: 'BEHAVIORAL', scope: 'COMPETITION', metric: 'deadlineDancer', tiers: single(1) },
  { key: 'completionist', category: 'BEHAVIORAL', scope: 'COMPETITION', metric: 'completed', tiers: single(1) },
  { key: 'champion-oracle', category: 'ORACLE', scope: 'COMPETITION', metric: 'championOracle', tiers: single(1) },
  { key: 'golden-touch', category: 'ORACLE', scope: 'COMPETITION', metric: 'goldenTouch', tiers: single(1) },
  { key: 'underdog-whisperer', category: 'ORACLE', scope: 'COMPETITION', metric: 'underdog', tiers: single(1) },
  { key: 'treble', category: 'TROPHY_META', scope: 'COMPETITION', metric: 'trophies', tiers: single(3) },
  { key: 'podium', category: 'TROPHY_META', scope: 'COMPETITION', metric: 'podium', tiers: single(1) },
]

// Secret, event-granted. The konami skin unlock lights this up; the copy is
// deliberately cryptic (see i18n) so the code that earns it isn't spoiled.
export const PONY_ACHIEVEMENT_KEY = 'the-magic-word'
export const PONY_ACHIEVEMENT: AchievementDef = {
  key: PONY_ACHIEVEMENT_KEY,
  category: 'SECRET',
  scope: 'GLOBAL',
  tiers: [{ tier: 'GOLD', threshold: 1 }],
  hidden: true,
}

// The full catalog for display (cabinet + i18n), batch-evaluated ones plus secrets.
export const ALL_ACHIEVEMENTS: AchievementDef[] = [...ACHIEVEMENTS, PONY_ACHIEVEMENT]

// The highest tier whose threshold the value meets, or null if none. Thresholds
// are ascending, so the last satisfied one wins.
export function tierForValue(tiers: AchievementTierThreshold[], value: number): AchievementTier | null {
  let earned: AchievementTier | null = null
  for (const t of tiers) if (value >= t.threshold) earned = t.tier
  return earned
}
