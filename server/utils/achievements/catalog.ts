import type { AchievementScope, AchievementTier } from '#shared/types/achievements'

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
  | 'SHAME'
  | 'SECRET'

// AchievementScope (COMPETITION vs GLOBAL) is defined in #shared and re-exported
// above so this module stays the one place the catalog is described.

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
  'missStreak', // longest run of consecutive MISS predictions (a "bad" badge)
  'perfectRounds', // rounds where every scored pick was EXACT (and none missing)
  'openingAct', // 1 = called the very first match of the tournament EXACT
  'completed', // 1 = tournament over AND predicted every match of it
  'championOracle', // 1 = champion pick paid out
  'goldenTouch', // 1 = best-scorer (Golden Boot) pick paid out
  'underdog', // 1 = a champion pick outside the FIFA top 15 (or unranked) that won
  'loneWolf', // matches where this user was the only EXACT
  'trophies', // competition-end trophies held
  'podium', // 1 = tournament over AND finished top 3 overall
  'woodenSpoon', // 1 = tournament over AND finished dead last (a "bad" badge)
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
// A single-shot badge that reads as high rarity: no bronze/silver rungs, straight to gold.
const singleGold = (threshold = 1): AchievementTierThreshold[] => [{ tier: 'GOLD', threshold }]
const graded = (b: number, s: number, g: number): AchievementTierThreshold[] => [
  { tier: 'BRONZE', threshold: b },
  { tier: 'SILVER', threshold: s },
  { tier: 'GOLD', threshold: g },
]

// The batch-evaluated catalog (everything except event-granted secrets).
export const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'first-blood', category: 'MILESTONE', scope: 'COMPETITION', metric: 'exact', tiers: single(1) },
  // Called the tournament's very first match EXACT. Rare and unrepeatable, so gold.
  { key: 'opening-act', category: 'MILESTONE', scope: 'COMPETITION', metric: 'openingAct', tiers: singleGold(1) },
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
  // "Bad" badges (SHAME): earned by doing poorly. Excluded from the-collector so
  // the completionist secret never demands you tank a tournament (see isCollectable).
  { key: 'cold-streak', category: 'SHAME', scope: 'COMPETITION', metric: 'missStreak', tiers: single(5) },
  { key: 'wooden-spoon', category: 'SHAME', scope: 'COMPETITION', metric: 'woodenSpoon', tiers: single(1) },
]

// The badges the-collector requires. SHAME badges are opt-out: they conflict with
// the "good" ones (in any real-sized field, dead last is nowhere near top-3), so
// requiring them would make the collector unwinnable in a single competition.
export const isCollectable = (def: AchievementDef): boolean => def.category !== 'SHAME'
export const COLLECTABLE_ACHIEVEMENTS: AchievementDef[] = ACHIEVEMENTS.filter(isCollectable)

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

// Secret, evaluated (not event-granted): unlocks once every non-hidden badge
// above is earned. Hidden + cryptic so it isn't dangled as a to-do list.
export const COLLECTOR_ACHIEVEMENT_KEY = 'the-collector'
export const COLLECTOR_ACHIEVEMENT: AchievementDef = {
  key: COLLECTOR_ACHIEVEMENT_KEY,
  category: 'SECRET',
  scope: 'GLOBAL',
  tiers: [{ tier: 'GOLD', threshold: 1 }],
  hidden: true,
}

// The full catalog for display (cabinet + i18n), batch-evaluated ones plus secrets.
export const ALL_ACHIEVEMENTS: AchievementDef[] = [...ACHIEVEMENTS, PONY_ACHIEVEMENT, COLLECTOR_ACHIEVEMENT]

// The highest tier whose threshold the value meets, or null if none. Thresholds
// are ascending, so the last satisfied one wins.
export function tierForValue(tiers: AchievementTierThreshold[], value: number): AchievementTier | null {
  let earned: AchievementTier | null = null
  for (const t of tiers) if (value >= t.threshold) earned = t.tier
  return earned
}
