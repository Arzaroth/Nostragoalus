import type { NotificationType } from '../../../shared/types/notifications'

// The push categories shown as toggles in preferences. GOAL/MATCH_LIVE are
// push-only (not stored notification types), so they map straight to a category
// in their trigger code; the rest derive their category from the stored type.
export type PushCategory =
  | 'reminders'
  | 'kickoff'
  | 'goals'
  | 'matchResults'
  | 'tournament'
  | 'league'
  | 'mentions'

export const PUSH_CATEGORIES: PushCategory[] = ['reminders', 'kickoff', 'goals', 'matchResults', 'tournament', 'league', 'mentions']

// Default-on for the time-sensitive and result categories; league social is
// off by default (low urgency). Mentions are directed at the recipient by name,
// so they are default-on. null on a column means "use this default".
export const PUSH_DEFAULTS: Record<PushCategory, boolean> = {
  reminders: true,
  kickoff: true,
  goals: true,
  matchResults: true,
  tournament: true,
  league: false,
  mentions: true,
}

// The user column backing each category (the better-auth additionalFields).
export const PUSH_COLUMN: Record<PushCategory, keyof PushPrefs> = {
  reminders: 'pushReminders',
  kickoff: 'pushKickoff',
  goals: 'pushGoals',
  matchResults: 'pushMatchResults',
  tournament: 'pushTournament',
  league: 'pushLeague',
  mentions: 'pushMentions',
}

export interface PushPrefs {
  pushReminders: boolean | null
  pushKickoff: boolean | null
  pushGoals: boolean | null
  pushMatchResults: boolean | null
  pushTournament: boolean | null
  pushLeague: boolean | null
  pushMentions: boolean | null
}

export function isPushEnabled(prefs: PushPrefs | null | undefined, category: PushCategory): boolean {
  const value = prefs?.[PUSH_COLUMN[category]]
  return value ?? PUSH_DEFAULTS[category]
}

// Stored notification type -> push category (for the createNotification hook).
const TYPE_CATEGORY: Record<NotificationType, PushCategory> = {
  PICK_REMINDER: 'reminders',
  MATCH_RESULT: 'matchResults',
  CHAMPION_RESULT: 'tournament',
  BEST_SCORER_RESULT: 'tournament',
  TROPHY_AWARDED: 'tournament',
  ACHIEVEMENT_UNLOCKED: 'tournament',
  LEAGUE_JOIN: 'league',
  LEAGUE_ROLE: 'league',
  LEAGUE_REMOVED: 'league',
  CHAT_MENTION: 'mentions',
}

export function categoryForType(type: NotificationType): PushCategory {
  return TYPE_CATEGORY[type]
}
