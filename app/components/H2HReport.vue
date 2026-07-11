<script setup lang="ts">
import type { H2HResponse } from '#shared/types/h2h'

const props = defineProps<{ data: H2HResponse }>()
const { t } = useI18n()

// Player A carries the primary hue and a solid line; player B a contrasting
// amber and a dashed line, so the two series are told apart by shape as well as
// colour (colour-blind safe without relying on the swatches alone).
const A_COLOR = 'var(--p-primary-color)'
const B_COLOR = '#f59e0b'

const leader = computed(() => {
  const { aPoints, bPoints } = props.data
  return aPoints > bPoints ? 'a' : aPoints < bPoints ? 'b' : 'tie'
})

// Two cumulative-points series (A and B) over the shared sparkline geometry,
// both scaled to the same max so the lead reads on one axis.
const chart = computed(() => {
  const pts = props.data.overTime
  const bands = sparkBands(pts)
  const maxY = Math.max(1, ...pts.map((r) => Math.max(r.aPoints, r.bPoints)))
  return {
    a: sparkLine(bands, (r) => r.aPoints, maxY),
    b: sparkLine(bands, (r) => r.bPoints, maxY),
    bands,
  }
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Header: the two players and the score line -->
    <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <div class="flex flex-col items-center text-center gap-1" :class="leader === 'b' ? 'opacity-60' : ''">
        <UserAvatar :image="data.a.image" :user-id="data.a.id" size="large" />
        <div class="font-semibold text-sm truncate max-w-full">{{ data.a.name }}</div>
        <div class="text-2xl font-bold tabular-nums" :style="`color: ${A_COLOR}`">{{ data.aPoints }}</div>
      </div>
      <div class="text-xs uppercase tracking-wide" style="color: var(--p-text-muted-color)">{{ t('h2h.vs') }}</div>
      <div class="flex flex-col items-center text-center gap-1" :class="leader === 'a' ? 'opacity-60' : ''">
        <UserAvatar :image="data.b.image" :user-id="data.b.id" size="large" />
        <div class="font-semibold text-sm truncate max-w-full">{{ data.b.name }}</div>
        <div class="text-2xl font-bold tabular-nums" :style="`color: ${B_COLOR}`">{{ data.bPoints }}</div>
      </div>
    </div>

    <!-- Summary stats -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div v-for="s in [
        { label: t('h2h.shared'), value: data.shared },
        { label: t('h2h.record'), value: `${data.aWins}-${data.bWins}-${data.ties}` },
        { label: t('h2h.sameScore'), value: data.agreement.sameScore },
        { label: t('h2h.sameOutcome'), value: data.agreement.sameOutcome },
      ]" :key="s.label" class="ng-card rounded-xl border px-4 py-3" style="background: var(--p-content-background); border-color: var(--p-content-border-color)">
        <div class="text-2xl font-bold tabular-nums">{{ s.value }}</div>
        <div class="text-xs" style="color: var(--p-text-muted-color)">{{ s.label }}</div>
      </div>
    </div>
    <div class="text-xs -mt-3" style="color: var(--p-text-muted-color)">{{ t('h2h.recordHint') }}</div>

    <!-- Lead over time -->
    <section v-if="data.overTime.length > 1">
      <h2 class="font-semibold mb-2">{{ t('h2h.leadTitle') }}</h2>
      <div class="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-xs">
        <span class="inline-flex items-center gap-1.5"><span class="w-4 h-0.5 inline-block" :style="`background: ${A_COLOR}`" />{{ data.a.name }}</span>
        <span class="inline-flex items-center gap-1.5"><span class="w-4 h-0.5 inline-block border-t border-dashed" :style="`border-color: ${B_COLOR}`" />{{ data.b.name }}</span>
      </div>
      <svg :viewBox="`0 0 ${300} ${100}`" preserveAspectRatio="none" class="w-full h-28 overflow-visible" role="img" :aria-label="t('h2h.leadTitle')">
        <polyline :points="chart.a" fill="none" :stroke="A_COLOR" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
        <polyline :points="chart.b" fill="none" :stroke="B_COLOR" stroke-width="2" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
        <rect v-for="(c, i) in chart.bands" :key="c.item.order" v-tooltip.top="`${c.item.label}: ${data.a.name} ${c.item.aPoints} · ${data.b.name} ${c.item.bPoints}`" :x="Math.max(0, c.x - c.band / 2)" y="0" :width="c.band" :height="100" fill="transparent" :data-round="i" />
      </svg>
    </section>

    <!-- Biggest divergences -->
    <section v-if="data.divergences.length">
      <h2 class="font-semibold mb-2">{{ t('h2h.divergeTitle') }}</h2>
      <ul class="flex flex-col gap-2" data-test="h2h-divergences">
        <li v-for="m in data.divergences" :key="m.matchId" class="ng-card rounded-xl border px-4 py-3 flex items-center gap-3 text-sm" style="background: var(--p-content-background); border-color: var(--p-content-border-color)">
          <div class="flex items-center gap-1.5 min-w-0 flex-1">
            <img v-if="flagUrl(m.homeCode)" :src="flagUrl(m.homeCode) || ''" class="w-4 h-4 rounded object-cover shrink-0" alt="" >
            <span class="truncate">{{ m.home }} {{ m.actual }} {{ m.away }}</span>
            <img v-if="flagUrl(m.awayCode)" :src="flagUrl(m.awayCode) || ''" class="w-4 h-4 rounded object-cover shrink-0" alt="" >
          </div>
          <div class="flex items-center gap-3 shrink-0 tabular-nums text-xs">
            <span class="flex items-center gap-1" :class="m.winner === 'a' ? 'font-semibold' : ''" :style="m.winner === 'a' ? `color: ${A_COLOR}` : 'color: var(--p-text-muted-color)'">
              {{ m.aPredicted }} <span>({{ m.aPoints }})</span>
            </span>
            <span class="flex items-center gap-1" :class="m.winner === 'b' ? 'font-semibold' : ''" :style="m.winner === 'b' ? `color: ${B_COLOR}` : 'color: var(--p-text-muted-color)'">
              {{ m.bPredicted }} <span>({{ m.bPoints }})</span>
            </span>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
