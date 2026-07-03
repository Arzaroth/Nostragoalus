import { useQuery } from '@tanstack/vue-query'
import type { Serialized } from '#shared/types/serialized'
import type { BotPersonaParam } from '#shared/types/bot'
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
  persona: BotPersonaParam
  method: 'MODE' | 'MEAN'
  modeAvailable: boolean
}

export interface BotPredictionsPayload {
  bot: { id: string }
  persona: BotPersonaParam
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
// consensus method in one place carries over to the other. Only CONSENSUS and
// EVIL_TWIN read it; the equalizer ignores the method entirely.
export function useBotMethod() {
  return useState<BotMethodParam>('bot-method', () => 'mode')
}

// Which persona ghosts are toggled on in the leaderboard (independent rows).
export function useBotPersonas() {
  return useState<BotPersonaParam[]>('bot-personas', () => [])
}

// A league id scopes the consensus to that league's members; the server
// derives the competition from the league, so only one of the two is sent.
function botQuery(
  slug: Ref<string | null>,
  persona: BotPersonaParam,
  method: Ref<BotMethodParam>,
  league: Ref<string | null>,
) {
  const scope = league.value ? { league: league.value } : { competition: slug.value ?? undefined }
  return { ...scope, persona, method: method.value }
}

export function useBotRow(
  persona: BotPersonaParam,
  enabled: Ref<boolean>,
  method: Ref<BotMethodParam>,
  leagueId?: Ref<string | null>,
) {
  const slug = useSelectedCompetition()
  const league = leagueId ?? ref(null)
  return useQuery({
    queryKey: ['bot-row', persona, slug, method, league],
    enabled,
    queryFn: ({ signal }) =>
      $fetch<BotRowPayload>('/api/bot/leaderboard-row', { query: botQuery(slug, persona, method, league), signal }),
  })
}

export function useBotPredictions(
  persona: Ref<BotPersonaParam>,
  method: Ref<BotMethodParam>,
  leagueId?: Ref<string | null>,
) {
  const slug = useSelectedCompetition()
  const league = leagueId ?? ref(null)
  return useQuery({
    queryKey: ['bot-predictions', persona, slug, method, league],
    queryFn: ({ signal }) =>
      $fetch<BotPredictionsPayload>('/api/bot/predictions', {
        query: botQuery(slug, persona.value, method, league),
        signal,
      }),
  })
}

// A specific player's evil twin (their own picks swapped) for their profile
// page. `competition` is a slug, or 'global' - the twin has no global identity,
// so the caller only enables it in a single-competition view.
export function useUserEvilTwin(userId: Ref<string>, competition: Ref<string | null>, enabled: Ref<boolean>) {
  return useQuery({
    queryKey: ['evil-twin', userId, competition],
    enabled,
    queryFn: ({ signal }) =>
      $fetch<BotPredictionsPayload>('/api/bot/predictions', {
        query: { persona: 'evil-twin', user: userId.value, competition: competition.value ?? undefined },
        signal,
      }),
  })
}
