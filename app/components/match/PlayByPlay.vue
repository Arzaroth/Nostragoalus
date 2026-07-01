<script setup lang="ts">
import { TIMELINE_ICONS, isGoalKind, pbpTextSpec, pbpFlagCode, type PbpEventInput } from '../../utils/match-view'
import { EXTRA_TIME_BREAK_MINUTE } from '#shared/types/match'

export interface PlayByPlayEvent extends PbpEventInput {
  side?: string | null
  minute?: string | null
  homeScore?: number | null
  awayScore?: number | null
}

const props = withDefaults(
  defineProps<{
    events: PlayByPlayEvent[]
    homeCode?: string | null
    awayCode?: string | null
    pending?: boolean
    compact?: boolean
  }>(),
  { homeCode: null, awayCode: null, pending: false, compact: false },
)

const { t } = useI18n()

// FIFA leaves break subs without a minute; surface the half-time marker for both
// the half-time (empty) and extra-time-interval (sentinel) breaks.
const minuteLabel = (minute: string | null | undefined) =>
  minute === '' || minute === EXTRA_TIME_BREAK_MINUTE ? t('match.halfTime') : (minute ?? '')

function pbpText(e: PbpEventInput): string {
  const spec = pbpTextSpec(e)
  return spec.literal ?? (spec.key ? t(spec.key, spec.params ?? {}) : '')
}
function pbpFlag(e: { side?: string | null }): string | null {
  return flagUrl(pbpFlagCode(e.side ?? null, props.homeCode, props.awayCode))
}
</script>

<template>
  <div v-if="pending && !events.length" class="flex flex-col gap-2">
    <div v-for="i in compact ? 5 : 8" :key="i" class="flex items-center gap-3 py-1">
      <Skeleton width="2rem" height="0.9rem" />
      <Skeleton width="1.25rem" height="1.25rem" shape="circle" />
      <Skeleton :width="`${8 + (i % 4) * 2}rem`" height="0.9rem" />
    </div>
  </div>
  <div v-else-if="!events.length" class="text-sm text-center py-4" style="color: var(--p-text-muted-color)">{{ t('match.playByPlayEmpty') }}</div>
  <div v-else class="flex flex-col" :class="compact ? 'max-h-full overflow-y-auto overscroll-contain' : 'md:max-h-[60vh] md:overflow-y-auto md:overscroll-contain'">
    <div
      v-for="(e, i) in events"
      :key="i"
      class="grid grid-cols-[2.25rem_1.5rem_1fr_auto] items-baseline gap-2 border-t ps-2"
      :class="[isGoalKind(e.kind) ? 'font-semibold' : '', compact ? 'py-1 text-sm' : 'py-2']"
      :style="`border-inline-start: 2px solid ${e.side === 'HOME' ? 'var(--p-primary-color)' : e.side === 'AWAY' ? '#71717a' : 'transparent'}; border-top-color: var(--p-content-border-color)`"
    >
      <span class="tabular-nums text-xs text-end" style="color: var(--p-text-muted-color)">{{ minuteLabel(e.minute) }}</span>
      <span class="text-center leading-none"><WhistleIcon v-if="e.kind === 'foul'" /><CornerFlagIcon v-else-if="e.kind === 'corner'" /><template v-else>{{ TIMELINE_ICONS[e.kind] || '•' }}</template></span>
      <span :style="e.side ? '' : 'color: var(--p-text-muted-color)'"><img v-if="pbpFlag(e)" :src="pbpFlag(e) || ''" class="inline-block w-4 h-3 rounded-sm object-cover me-1.5" style="vertical-align: -0.1em" alt="" >{{ pbpText(e) }}</span>
      <span v-if="isGoalKind(e.kind) && e.homeScore != null" class="tabular-nums text-xs px-1.5 py-0.5 rounded" style="background: var(--p-content-border-color)">{{ e.homeScore }}–{{ e.awayScore }}</span>
    </div>
  </div>
</template>
