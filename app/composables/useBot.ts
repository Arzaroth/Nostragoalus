import { useQuery } from '@tanstack/vue-query'
import type { Serialized } from '#shared/types/serialized'
import type { BotChampion, BotMatchRow, BotSummary } from '../../server/utils/bot/service'

// Lowercase on the wire; the server echoes the effective method back after
// the population gate (a 'mode' request can come back as MEAN).
export type BotMethodParam = 'mode' | 'mean'

export interface BotLeaderboardRow {
  rank: number | null
  userId: string
  totalPoints: number
  predictionPoints: number
  championPoints: number
  championCode: string | null
  championName: string | null
  bestScorerPoints: number
  bestScorerName: string | null
  bestScorerCode: string | null
  exactCount: number
  outcomeCount: number
  gdCount: number
}

export interface BotRowPayload {
  row: BotLeaderboardRow | null
  method: 'MODE' | 'MEAN'
  modeAvailable: boolean
}

export interface BotPredictionsPayload {
  bot: { id: string }
  competition: { id: string; slug: string; name: string }
  league: { id: string; name: string } | null
  champion: BotChampion | null
  summary: BotSummary
  admin: boolean
  method: 'MODE' | 'MEAN'
  modeAvailable: boolean
  population: number
  predictions: Serialized<BotMatchRow>[]
}

// Shared between the leaderboard toggle and the bot page so switching the
// consensus method in one place carries over to the other.
export function useBotMethod() {
  return useState<BotMethodParam>('bot-method', () => 'mode')
}

// A league id scopes the consensus to that league's members; the server
// derives the competition from the league, so only one of the two is sent.
function botQuery(slug: Ref<string | null>, method: Ref<BotMethodParam>, league: Ref<string | null>) {
  return league.value
    ? { league: league.value, method: method.value }
    : { competition: slug.value ?? undefined, method: method.value }
}

export function useBotRow(enabled: Ref<boolean>, method: Ref<BotMethodParam>, leagueId?: Ref<string | null>) {
  const slug = useSelectedCompetition()
  const league = leagueId ?? ref(null)
  return useQuery({
    queryKey: ['bot-row', slug, method, league],
    enabled,
    queryFn: ({ signal }) =>
      $fetch<BotRowPayload>('/api/bot/leaderboard-row', { query: botQuery(slug, method, league), signal }),
  })
}

export function useBotPredictions(method: Ref<BotMethodParam>, leagueId?: Ref<string | null>) {
  const slug = useSelectedCompetition()
  const league = leagueId ?? ref(null)
  return useQuery({
    queryKey: ['bot-predictions', slug, method, league],
    queryFn: ({ signal }) =>
      $fetch<BotPredictionsPayload>('/api/bot/predictions', { query: botQuery(slug, method, league), signal }),
  })
}
