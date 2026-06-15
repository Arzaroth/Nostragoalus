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

// The shape the API and the WS `notification:new` push both carry; the client
// renders off `data` and derives the deep link from it.
export interface NotificationDTO {
  id: string
  type: NotificationType
  data: NotificationData
  read: boolean
  createdAt: string
}
