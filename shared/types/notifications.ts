import { DEFAULT_COMPETITION } from '../competition'
import type { AchievementTier, CompetitionAwardType } from './achievements'

// In-app notification center. The `type` column on user_notification mirrors
// `data.type` (the service derives it on insert, so they can't drift); the typed
// `data` bag drives rendering and deep-linking with no per-type columns.
export type NotificationType =
  | 'LEAGUE_JOIN'
  | 'LEAGUE_ROLE'
  | 'LEAGUE_REMOVED'
  | 'PICK_REMINDER'
  | 'MATCH_RESULT'
  | 'CHAMPION_RESULT'
  | 'BEST_SCORER_RESULT'
  | 'TROPHY_AWARDED'
  | 'ACHIEVEMENT_UNLOCKED'
  | 'CHAT_MENTION'

export type NotificationData =
  | { type: 'LEAGUE_JOIN'; leagueId: string; leagueName: string; joinerName: string }
  | { type: 'LEAGUE_ROLE'; leagueId: string; leagueName: string; role: 'MODERATOR' | 'OWNER' }
  | { type: 'LEAGUE_REMOVED'; leagueId: string; leagueName: string }
  | {
      type: 'PICK_REMINDER'
      matchId: string
      competitionSlug: string
      homeTeam: string
      awayTeam: string
      kickoffTime: string
    }
  | {
      type: 'MATCH_RESULT'
      matchId: string
      competitionSlug: string
      homeTeam: string
      awayTeam: string
      homeScore: number
      awayScore: number
      points: number
    }
  | {
      type: 'CHAMPION_RESULT'
      competitionSlug: string
      competitionName: string
      teamName: string
      points: number
      won: boolean
    }
  | {
      type: 'BEST_SCORER_RESULT'
      competitionSlug: string
      competitionName: string
      playerName: string
      points: number
      won: boolean
    }
  // A competition-end trophy landed on your cabinet. teamName is set only for the
  // team-specialist trophy (it names the team); userId is the recipient, for the
  // deep link to their own cabinet.
  | {
      type: 'TROPHY_AWARDED'
      competitionSlug: string
      competitionName: string
      userId: string
      trophyType: CompetitionAwardType
      teamName: string | null
    }
  // A milestone badge unlocked. competitionSlug/Name are null for a global
  // (competition-spanning) badge like the secret unlock; tier is null for a
  // single-shot badge.
  | {
      type: 'ACHIEVEMENT_UNLOCKED'
      competitionSlug: string | null
      competitionName: string | null
      userId: string
      key: string
      tier: AchievementTier | null
    }
  // Someone @-mentioned the recipient in league chat. Carries room context only
  // (sender name + which room): the message itself is E2EE, so no preview. matchId
  // null = the league-global room; home/away name the match thread otherwise.
  | {
      type: 'CHAT_MENTION'
      leagueId: string
      leagueName: string
      competitionSlug: string
      matchId: string | null
      homeTeam: string | null
      awayTeam: string | null
      senderId: string
      senderName: string
    }

// Deep link for a chat-mention notification (push URL + bell click). Selects the
// target league for its competition (`ngLeague`) and opens the dock to that room
// (`chat`=the matchId, or `global`); a client handler reads these on load. Lives
// here so the server push builder and the client bell share one path shape.
export function chatMentionPath(d: {
  competitionSlug: string
  leagueId: string
  matchId: string | null
}): string {
  const base = d.matchId ? `/${d.competitionSlug}/matches/${d.matchId}` : `/${d.competitionSlug}`
  const room = d.matchId ?? 'global'
  return `${base}?ngLeague=${encodeURIComponent(d.leagueId)}&chat=${encodeURIComponent(room)}`
}

// Deep link for a trophy/achievement notification: the recipient's own cabinet,
// on their profile under the competition. A global badge (no competition) links
// home. Shared so the server push builder and the client bell agree.
// A user's trophy cabinet lives on their competition-scoped profile, below their
// picks. Global achievements/trophies carry no competitionSlug, but the cabinet
// shows global items under any competition, so fall back to the primary one
// rather than dumping the click on the home page. The #cabinet hash scrolls past
// the picks straight to the achievements.
export function cabinetPath(d: { competitionSlug: string | null; userId: string }): string {
  return `/${d.competitionSlug ?? DEFAULT_COMPETITION}/users/${d.userId}#cabinet`
}

// The shape the API and the WS `notification:new` push both carry; the client
// renders off `data` and derives the deep link from it.
export interface NotificationDTO {
  id: string
  type: NotificationType
  data: NotificationData
  read: boolean
  createdAt: string
}
