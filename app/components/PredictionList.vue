<script setup lang="ts">
const { t } = useI18n()
const { enabled: crowdEnabled, totals: crowdTotals } = useCrowdTotals()
const slug = useSelectedCompetition()
defineProps<{ predictions: MyPrediction[]; editable?: boolean }>()
const emit = defineEmits<{ toggleJoker: [p: MyPrediction]; updateScore: [payload: { p: MyPrediction; home: number; away: number }] }>()

function fmt(d: string) {
  return new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function isLocked(p: MyPrediction) {
  return new Date(p.kickoffTime).getTime() <= Date.now()
}
function rarityTip(p: { crowdShare?: number | string | null }) {
  const pct = p.crowdShare != null ? Math.round(Number(p.crowdShare) * 100) : null
  return pct != null ? t('predictions.rarityTip', { pct }) : t('predictions.rarityTipNoShare')
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <NuxtLink
      v-for="p in predictions"
      :key="p.id"
      :to="`/${p.competitionSlug ?? slug}/matches/${p.matchId}`"
      class="ng-card block rounded-2xl border p-4"
      style="background: var(--p-content-background)"
    >
      <div class="flex items-center justify-between text-xs mb-2" style="color: var(--p-text-muted-color)">
        <span>{{ p.roundLabel }} · {{ fmt(p.kickoffTime) }}</span>
        <button
          v-if="editable && !isLocked(p) && p.stage !== 'FINAL' && p.stage !== 'THIRD_PLACE' && p.homeTeamCode && p.awayTeamCode"
          type="button"
          class="font-semibold flex items-center gap-1 transition hover:opacity-80"
          :style="`color:${p.isJoker ? '#f59e0b' : 'var(--p-text-muted-color)'}`"
          @click.stop.prevent="emit('toggleJoker', p)"
        >
          <i :class="p.isJoker ? 'pi pi-star-fill' : 'pi pi-star'" />{{ p.isJoker ? t('predictions.joker') : t('predictions.makeJoker') }}
        </button>
        <span v-else-if="p.stage === 'FINAL'" class="font-semibold" style="color: #f59e0b" :title="t('predictions.finalDoubleHint')">★ {{ t('predictions.finalDouble') }}</span>
        <span v-else-if="p.isJoker" class="font-semibold" style="color: #f59e0b">★ {{ t('predictions.joker') }}</span>
      </div>

      <!-- grid with symmetric 1fr sides keeps the score block dead-center regardless of name lengths -->
      <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <div class="flex items-center gap-2 min-w-0 justify-end">
          <span class="truncate font-medium text-right" :title="p.homeTeam">{{ p.homeTeam }}</span>
          <img v-if="flagUrl(p.homeTeamCode)" :src="flagUrl(p.homeTeamCode) || ''" class="w-6 h-6 rounded object-cover" alt="" >
        </div>
        <div class="text-center shrink-0 px-2">
          <!-- Open matches stay editable right from My Picks. -->
          <div v-if="editable && !isLocked(p)" @click.stop.prevent>
            <ScoreInput :home="p.homeGoals" :away="p.awayGoals" @update="(v) => emit('updateScore', { p, home: v.home, away: v.away })" />
            <div v-if="crowdEnabled" class="text-xs tabular-nums mt-1" style="color: var(--p-text-muted-color)" :title="t('prefs.crowd')">👥 <template v-if="crowdTotals[p.matchId]">{{ crowdTotals[p.matchId].home }}–{{ crowdTotals[p.matchId].away }}</template><template v-else>–</template></div>
          </div>
          <template v-else>
            <div class="font-bold tabular-nums text-lg">{{ p.homeGoals }}–{{ p.awayGoals }}</div>
            <div v-if="p.fullTimeHome !== null" class="text-xs" style="color: var(--p-text-muted-color)">
              {{ p.fullTimeHome }}–{{ p.fullTimeAway }}<template v-if="pensResult(p)"> ({{ pensResult(p) }} {{ t('match.pens') }})</template>
            </div>
          </template>
        </div>
        <div class="flex items-center gap-2 min-w-0">
          <img v-if="flagUrl(p.awayTeamCode)" :src="flagUrl(p.awayTeamCode) || ''" class="w-6 h-6 rounded object-cover" alt="" >
          <span class="truncate font-medium" :title="p.awayTeam">{{ p.awayTeam }}</span>
        </div>
      </div>

      <div v-if="p.totalPoints !== null" class="flex items-center justify-center gap-2 mt-3 text-xs">
        <Tag :value="tierLabel(p.baseTier)" :severity="p.totalPoints > 0 ? 'success' : 'secondary'" />
        <span class="font-semibold" style="color: var(--p-primary-color)">+{{ p.totalPoints }} pts</span>
        <span
          v-if="p.bonusPoints"
          v-tooltip.top="rarityTip(p)"
          class="font-semibold px-1.5 py-0.5 rounded-full cursor-help"
          style="color: #f59e0b; background: rgba(245, 158, 11, 0.12)"
        >+{{ p.bonusPoints }} {{ t('predictions.rarity') }}</span>
        <span
          v-if="Number(p.jokerMultiplierApplied) > 1"
          v-tooltip.top="p.stage === 'FINAL' ? t('predictions.finalDoubleHint') : t('predictions.jokerHint')"
          class="font-bold px-1.5 py-0.5 rounded-full cursor-help"
          style="color: #f59e0b; background: rgba(245, 158, 11, 0.12)"
        >×{{ Number(p.jokerMultiplierApplied) }}</span>
      </div>
    </NuxtLink>
  </div>
</template>
