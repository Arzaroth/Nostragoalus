<script setup lang="ts">
import type { CrowdTotal } from '../composables/useCrowdTotals'

// Pure display: the parent owns the single useCrowdTotals() instance (it
// holds the WS connection) and passes the maps down.
const props = defineProps<{
  matchId: string
  totals: Record<string, CrowdTotal>
  leagueTotals?: Record<string, CrowdTotal>
  leagueActive?: boolean
  label?: boolean
  count?: boolean
}>()

const { t } = useI18n()
const g = computed(() => props.totals[props.matchId])
const l = computed(() => props.leagueTotals?.[props.matchId])

function fmt(v: CrowdTotal | undefined) {
  // count <= 0 is the server's anonymity-floor sentinel (a live push below the
  // minimum): render it as no-data, not a real "0-0" consensus.
  if (!v || v.count <= 0) return '–'
  return `${v.home}–${v.away}${props.count ? ` (${v.count})` : ''}`
}
</script>

<template>
  <span
    v-tooltip.top="props.leagueActive ? t('leagues.crowdBonusHint') : t('prefs.crowd')"
    class="text-xs tabular-nums"
    style="color: var(--p-text-muted-color)"
  >
    👥 <template v-if="props.label && !props.leagueActive">{{ t('predictions.crowd') }}: </template>
    <template v-if="props.leagueActive">
      <span v-tooltip.bottom="t('leagues.crowdLeague')">{{ fmt(l) }}</span>
      <span v-tooltip.bottom="t('predictions.crowd')" class="opacity-70"> · 🌐 {{ fmt(g) }}</span>
    </template>
    <template v-else>{{ fmt(g) }}</template>
  </span>
</template>
