<script setup lang="ts">
import { matchHasStarted, matchIsInPlay, type MatchStatus } from '#shared/types/match'
import { liveClockSpec } from '../../utils/match-view'
import type { MatchListItem } from '../../composables/useMatches'
import type { PlayByPlayEvent } from '../match/PlayByPlay.vue'

const props = defineProps<{ matchId: string; match?: MatchListItem; focused?: boolean }>()

const { t } = useI18n()
const idRef = toRef(props, 'matchId')
const status = computed<string>(() => props.match?.status ?? 'SCHEDULED')
const hasStarted = computed(() => matchHasStarted(status.value as MatchStatus))
const isLive = computed(() => matchIsInPlay(status.value as MatchStatus))

// live-detail only once a match is under way; timeline only for the focused cell.
const { data: detail } = useMatchLiveDetail(idRef, hasStarted)
const { data: events } = useMatchTimeline(
  idRef,
  computed(() => !!props.focused && hasStarted.value),
)

const homeScore = computed(() => props.match?.fullTimeHome ?? null)
const awayScore = computed(() => props.match?.fullTimeAway ?? null)
const goals = computed<any[]>(() => (detail.value as any)?.goals ?? [])
const clock = computed(() => {
  if (!isLive.value) return null
  const s = liveClockSpec(status.value, detail.value as { halfTime?: boolean | null; minute?: string | null } | null)
  return 'text' in s ? s.text : t(s.key)
})
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <div class="flex items-center justify-center gap-3 py-2">
      <span class="tabular-nums text-3xl font-bold">{{ homeScore ?? '-' }} <span class="opacity-40">–</span> {{ awayScore ?? '-' }}</span>
      <span
        v-if="clock"
        class="text-xs font-bold px-1.5 py-0.5 rounded"
        style="color: var(--ng-danger); background: color-mix(in srgb, var(--ng-danger) 12%, transparent)"
        >{{ clock }}</span
      >
    </div>

    <div v-if="goals.length" class="flex flex-wrap gap-1 justify-center px-2 pb-1">
      <span v-for="(g, i) in goals" :key="i" class="text-[11px] px-1.5 py-0.5 rounded" style="background: var(--p-content-border-color)">
        ⚽ {{ formatPlayerName(g.playerName) }}<span v-if="g.minute" class="opacity-60"> {{ g.minute }}</span>
      </span>
    </div>

    <!-- Viewer presence, timeline and reactions ride sockets/heavy fetches, so
         they exist only for the focused cell. -->
    <div v-if="focused" class="flex justify-center pb-1">
      <MultiviewCellViewers :match-id="matchId" />
    </div>

    <div v-if="focused && hasStarted" class="flex-1 min-h-0 overflow-hidden border-t mt-1 pt-1" style="border-color: var(--p-content-border-color)">
      <MatchPlayByPlay :events="(events as PlayByPlayEvent[]) ?? []" :home-code="match?.homeTeamCode" :away-code="match?.awayTeamCode" compact />
    </div>

    <div v-if="focused && hasStarted" class="shrink-0 border-t mt-1 pt-1" style="border-color: var(--p-content-border-color)">
      <ReactionBar :match-id="matchId" />
    </div>
  </div>
</template>
