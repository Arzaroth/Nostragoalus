<script setup lang="ts">
import type { AnalyticsResponse, TeamBias } from '#shared/types/analytics'

const props = defineProps<{ data: AnalyticsResponse }>()
const { t } = useI18n()

const pct = (n: number) => Math.round(n * 100)
// Signed percentage-point label, e.g. "+12" / "-8".
const signed = (n: number) => `${n > 0 ? '+' : ''}${Math.round(n)}`

const tierSegments = computed(() => {
  const { exact, diff, outcome, miss } = props.data.tiers
  const total = props.data.totalPicks || 1
  return [
    { key: 'exact', n: exact, color: 'var(--ng-success)' },
    { key: 'diff', n: diff, color: '#3b82f6' },
    { key: 'outcome', n: outcome, color: '#a855f7' },
    { key: 'miss', n: miss, color: 'var(--p-text-muted-color)' },
  ].map((s) => ({ ...s, width: (s.n / total) * 100 }))
})

// Positive lean = over-predicts goals; near zero = reads the pace well.
const goalsVerdict = computed(() => {
  const l = props.data.goals.lean
  if (l >= 0.5) return t('analytics.goalsOver')
  if (l <= -0.5) return t('analytics.goalsUnder')
  return t('analytics.goalsBalanced')
})
// Accuracy sparkline geometry. One series (per-round accuracy, 0..1), plotted in
// a stretched viewBox so it fills the width; the line keeps a crisp 2px via
// non-scaling-stroke, and full-height hit rects carry the per-round tooltips.
const SPARK_W = 300
const SPARK_H = 100
const spark = computed(() => {
  const pts = props.data.overTime
  const n = pts.length
  const xAt = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * SPARK_W)
  const coords = pts.map((r, i) => ({ x: xAt(i), y: SPARK_H - r.accuracy * SPARK_H, r }))
  const line = coords.map((c) => `${c.x},${c.y}`).join(' ')
  const area = `M0,${SPARK_H} ${coords.map((c) => `L${c.x},${c.y}`).join(' ')} L${SPARK_W},${SPARK_H} Z`
  const band = SPARK_W / n
  return { coords, line, area, band }
})

function biasWidth(t: TeamBias) {
  return Math.min(100, Math.abs(t.delta) * 100)
}

const fergie = computed(() => props.data.fergieTime)
// Signed point label, e.g. "+3" / "-2" / "0".
const signedPts = (n: number) => `${n > 0 ? '+' : ''}${n}`
const netColor = (n: number) =>
  n > 0 ? 'var(--ng-success)' : n < 0 ? 'var(--ng-danger)' : 'var(--p-text-muted-color)'
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Summary strip -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div v-for="s in [
        { label: t('analytics.picks'), value: data.totalPicks },
        { label: t('analytics.points'), value: data.totalPoints },
        { label: t('analytics.avgPoints'), value: data.avgPoints },
        { label: t('analytics.accuracy'), value: `${pct(data.accuracy)}%` },
      ]" :key="s.label" class="ng-card rounded-xl border px-4 py-3" style="background: var(--p-content-background); border-color: var(--p-content-border-color)">
        <div class="text-2xl font-bold tabular-nums">{{ s.value }}</div>
        <div class="text-xs" style="color: var(--p-text-muted-color)">{{ s.label }}</div>
      </div>
    </div>

    <!-- Streak -->
    <section v-if="data.streak.best > 0" class="ng-card rounded-xl border px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1" style="background: var(--p-content-background); border-color: var(--p-content-border-color)">
      <div class="flex items-baseline gap-2">
        <span class="text-2xl" :class="data.streak.current > 0 ? '' : 'grayscale opacity-50'">🔥</span>
        <span class="text-2xl font-bold tabular-nums">{{ data.streak.current }}</span>
        <span class="text-sm" style="color: var(--p-text-muted-color)">{{ t('analytics.streakCurrent') }}</span>
      </div>
      <div class="text-sm" style="color: var(--p-text-muted-color)">
        {{ t('analytics.streakBest', { n: data.streak.best }) }}
      </div>
    </section>

    <!-- Tier breakdown -->
    <section>
      <h2 class="font-semibold mb-2">{{ t('analytics.tierTitle') }}</h2>
      <div class="flex h-4 rounded-full overflow-hidden" style="background: var(--p-content-border-color)">
        <div v-for="s in tierSegments" :key="s.key" :style="`width: ${s.width}%; background: ${s.color}`" />
      </div>
      <div class="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs" style="color: var(--p-text-muted-color)">
        <span v-for="s in tierSegments" :key="s.key" class="inline-flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-sm inline-block" :style="`background: ${s.color}`" />
          {{ t(`analytics.tier.${s.key}`) }} · <span class="tabular-nums">{{ s.n }}</span>
        </span>
      </div>
    </section>

    <!-- Goals lean -->
    <section class="ng-card rounded-xl border px-4 py-3" style="background: var(--p-content-background); border-color: var(--p-content-border-color)">
      <h2 class="font-semibold mb-1">{{ t('analytics.goalsTitle') }}</h2>
      <p class="text-sm" style="color: var(--p-text-muted-color)">
        {{ t('analytics.goalsLine', { predicted: data.goals.predictedAvg, actual: data.goals.actualAvg }) }}
      </p>
      <p class="text-sm font-medium mt-1">{{ goalsVerdict }}</p>
    </section>

    <!-- Outcome lean -->
    <section class="ng-card rounded-xl border px-4 py-3" style="background: var(--p-content-background); border-color: var(--p-content-border-color)">
      <h2 class="font-semibold mb-2">{{ t('analytics.outcomeTitle') }}</h2>
      <div class="grid grid-cols-3 gap-3 text-center text-sm">
        <div v-for="o in [
          { key: 'home', p: data.outcomeLean.predicted.home, a: data.outcomeLean.actual.home },
          { key: 'draw', p: data.outcomeLean.predicted.draw, a: data.outcomeLean.actual.draw },
          { key: 'away', p: data.outcomeLean.predicted.away, a: data.outcomeLean.actual.away },
        ]" :key="o.key">
          <div class="text-xs uppercase tracking-wide" style="color: var(--p-text-muted-color)">{{ t(`analytics.outcome.${o.key}`) }}</div>
          <div class="tabular-nums"><span class="font-bold">{{ o.p }}</span> <span style="color: var(--p-text-muted-color)">/ {{ o.a }}</span></div>
        </div>
      </div>
      <p class="text-xs mt-2" style="color: var(--p-text-muted-color)">{{ t('analytics.outcomeHint') }}</p>
      <div class="flex flex-wrap gap-2 mt-2">
        <span v-if="data.outcomeLean.homeBiasPct >= 10" class="text-xs px-2 py-1 rounded-full" style="background: color-mix(in srgb, var(--ng-danger) 15%, transparent); color: var(--ng-danger)">
          {{ t('analytics.homeBias', { n: signed(data.outcomeLean.homeBiasPct) }) }}
        </span>
        <span v-if="data.outcomeLean.drawGapPct <= -10" class="text-xs px-2 py-1 rounded-full" style="background: color-mix(in srgb, #a855f7 15%, transparent); color: #a855f7">
          {{ t('analytics.drawBlind', { n: signed(data.outcomeLean.drawGapPct) }) }}
        </span>
      </div>
    </section>

    <!-- Team bias -->
    <section v-if="data.teams.overrated.length || data.teams.underrated.length" class="grid sm:grid-cols-2 gap-4">
      <div v-for="col in [
        { title: t('analytics.overrated'), list: data.teams.overrated, color: 'var(--ng-danger)' },
        { title: t('analytics.underrated'), list: data.teams.underrated, color: 'var(--ng-success)' },
      ]" :key="col.title">
        <h2 class="font-semibold mb-2">{{ col.title }}</h2>
        <div v-if="!col.list.length" class="text-xs" style="color: var(--p-text-muted-color)">{{ t('analytics.noTeamBias') }}</div>
        <ul v-else class="flex flex-col gap-2">
          <li v-for="team in col.list" :key="team.name" class="flex items-center gap-2 text-sm">
            <img v-if="team.code && flagUrl(team.code)" :src="flagUrl(team.code) || ''" class="w-5 h-5 rounded object-cover shrink-0" alt="" >
            <span class="truncate flex-1">{{ team.name }}</span>
            <div class="w-16 h-2 rounded-full overflow-hidden shrink-0" style="background: var(--p-content-border-color)">
              <div :style="`width: ${biasWidth(team)}%; background: ${col.color}; height: 100%`" />
            </div>
            <span class="tabular-nums text-xs w-14 text-end" style="color: var(--p-text-muted-color)">
              {{ pct(team.predictedWinRate) }}% / {{ pct(team.actualWinRate) }}%
            </span>
          </li>
        </ul>
      </div>
    </section>

    <!-- Accuracy over time -->
    <section v-if="data.overTime.length > 1">
      <h2 class="font-semibold mb-2">{{ t('analytics.overTimeTitle') }}</h2>
      <svg :viewBox="`0 0 ${300} ${100}`" preserveAspectRatio="none" class="w-full h-24 overflow-visible" role="img" :aria-label="t('analytics.overTimeTitle')">
        <defs>
          <linearGradient id="ng-spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="var(--p-primary-color)" stop-opacity="0.35" />
            <stop offset="1" stop-color="var(--p-primary-color)" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path :d="spark.area" fill="url(#ng-spark-fill)" />
        <polyline :points="spark.line" fill="none" stroke="var(--p-primary-color)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round" />
        <rect v-for="(c, i) in spark.coords" :key="c.r.order" v-tooltip.top="`${c.r.label}: ${pct(c.r.accuracy)}% · ${c.r.points} ${t('leaderboard.pts')}`" :x="Math.max(0, c.x - spark.band / 2)" y="0" :width="spark.band" :height="100" fill="transparent" :data-round="i" />
      </svg>
      <div class="text-xs mt-1" style="color: var(--p-text-muted-color)">{{ t('analytics.overTimeHint') }}</div>
    </section>

    <!-- Best / worst -->
    <section class="grid sm:grid-cols-2 gap-4">
      <div v-if="data.bestCall" class="ng-card rounded-xl border px-4 py-3" style="background: var(--p-content-background); border-color: var(--p-content-border-color)">
        <div class="text-xs uppercase tracking-wide mb-1" style="color: var(--ng-success)">{{ t('analytics.bestCall') }}</div>
        <div class="font-semibold flex items-center gap-1.5">
          <img v-if="flagUrl(data.bestCall.homeCode)" :src="flagUrl(data.bestCall.homeCode) || ''" class="w-4 h-4 rounded object-cover shrink-0" alt="" >
          <span>{{ data.bestCall.home }} {{ data.bestCall.actual }} {{ data.bestCall.away }}</span>
          <img v-if="flagUrl(data.bestCall.awayCode)" :src="flagUrl(data.bestCall.awayCode) || ''" class="w-4 h-4 rounded object-cover shrink-0" alt="" >
        </div>
        <div class="text-xs" style="color: var(--p-text-muted-color)">{{ t('analytics.youPicked', { score: data.bestCall.predicted }) }} · +{{ data.bestCall.points }} {{ t('leaderboard.pts') }}</div>
      </div>
      <div v-if="data.worstMiss" class="ng-card rounded-xl border px-4 py-3" style="background: var(--p-content-background); border-color: var(--p-content-border-color)">
        <div class="text-xs uppercase tracking-wide mb-1" style="color: var(--ng-danger)">{{ t('analytics.worstMiss') }}</div>
        <div class="font-semibold flex items-center gap-1.5">
          <img v-if="flagUrl(data.worstMiss.homeCode)" :src="flagUrl(data.worstMiss.homeCode) || ''" class="w-4 h-4 rounded object-cover shrink-0" alt="" >
          <span>{{ data.worstMiss.home }} {{ data.worstMiss.actual }} {{ data.worstMiss.away }}</span>
          <img v-if="flagUrl(data.worstMiss.awayCode)" :src="flagUrl(data.worstMiss.awayCode) || ''" class="w-4 h-4 rounded object-cover shrink-0" alt="" >
        </div>
        <div class="text-xs" style="color: var(--p-text-muted-color)">{{ t('analytics.youPicked', { score: data.worstMiss.predicted }) }}</div>
      </div>
    </section>

    <!-- Fergie time -->
    <section v-if="fergie.matches" class="ng-card rounded-xl border px-4 py-3" data-test="fergie-time" style="background: var(--p-content-background); border-color: var(--p-content-border-color)">
      <h2 class="font-semibold mb-1">{{ t('analytics.fergieTitle') }}</h2>
      <p class="text-sm" style="color: var(--p-text-muted-color)">{{ t('analytics.fergieHint') }}</p>
      <div class="flex items-baseline gap-2 mt-2">
        <span class="text-3xl font-bold tabular-nums" :style="`color: ${netColor(fergie.netPoints)}`" data-test="fergie-net">{{ signedPts(fergie.netPoints) }}</span>
        <span class="text-sm" style="color: var(--p-text-muted-color)">{{ t('leaderboard.pts') }}</span>
      </div>
      <!-- The net is the split of won vs lost - spell it out so the two figures,
           not the example matches, read as what makes the headline. -->
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm">
        <span class="tabular-nums" style="color: var(--ng-success)">+{{ fergie.pointsWon }} {{ t('analytics.fergieWon') }}</span>
        <span class="tabular-nums" style="color: var(--ng-danger)">-{{ fergie.pointsLost }} {{ t('analytics.fergieLost') }}</span>
        <span class="text-xs" style="color: var(--p-text-muted-color)">{{ t('analytics.fergieSummary', { goals: fergie.goals, matches: fergie.matches }) }}</span>
      </div>
      <!-- Per-match breakdown: every match whose points moved in added time. A
           match can show both a gain and a loss (a score nailed then broken). -->
      <ul v-if="fergie.breakdown.length" class="flex flex-col gap-1.5 mt-3" data-test="fergie-breakdown">
        <li v-for="(row, i) in fergie.breakdown" :key="i" class="flex items-center gap-2 text-sm">
          <img v-if="flagUrl(row.homeCode)" :src="flagUrl(row.homeCode) || ''" class="w-4 h-4 rounded object-cover shrink-0" alt="" >
          <span class="truncate">{{ row.home }} {{ row.actual }} {{ row.away }}</span>
          <img v-if="flagUrl(row.awayCode)" :src="flagUrl(row.awayCode) || ''" class="w-4 h-4 rounded object-cover shrink-0" alt="" >
          <span class="text-xs shrink-0" style="color: var(--p-text-muted-color)">{{ t('analytics.youPicked', { score: row.predicted }) }}</span>
          <span class="ms-auto flex items-center gap-1.5 tabular-nums text-xs shrink-0">
            <span v-if="row.gained" style="color: var(--ng-success)">+{{ row.gained }}</span>
            <span v-if="row.lost" style="color: var(--ng-danger)">-{{ row.lost }}</span>
            <span class="font-semibold" :style="`color: ${netColor(row.net)}`">({{ signedPts(row.net) }})</span>
          </span>
        </li>
      </ul>
    </section>
  </div>
</template>
