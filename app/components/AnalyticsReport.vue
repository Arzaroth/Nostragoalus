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
    { key: 'miss', n: miss, color: 'var(--p-content-border-color)' },
  ].map((s) => ({ ...s, width: (s.n / total) * 100 }))
})

// Positive lean = over-predicts goals; near zero = reads the pace well.
const goalsVerdict = computed(() => {
  const l = props.data.goals.lean
  if (l >= 0.5) return t('analytics.goalsOver')
  if (l <= -0.5) return t('analytics.goalsUnder')
  return t('analytics.goalsBalanced')
})
const maxRoundPoints = computed(() => Math.max(1, ...props.data.overTime.map((r) => r.points)))

function biasWidth(t: TeamBias) {
  return Math.min(100, Math.abs(t.delta) * 100)
}
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
      <div class="flex items-end gap-1 h-24">
        <div v-for="r in data.overTime" :key="r.order" v-tooltip.top="`${r.label}: ${pct(r.accuracy)}% · ${r.points} ${t('leaderboard.pts')}`" class="flex-1 flex flex-col items-center justify-end h-full">
          <div class="w-full rounded-t" :style="`height: ${(r.points / maxRoundPoints) * 100}%; min-height: 2px; background: var(--p-primary-color); opacity: ${0.4 + r.accuracy * 0.6}`" />
        </div>
      </div>
      <div class="text-xs mt-1" style="color: var(--p-text-muted-color)">{{ t('analytics.overTimeHint') }}</div>
    </section>

    <!-- Best / worst -->
    <section class="grid sm:grid-cols-2 gap-4">
      <div v-if="data.bestCall" class="ng-card rounded-xl border px-4 py-3" style="background: var(--p-content-background); border-color: var(--p-content-border-color)">
        <div class="text-xs uppercase tracking-wide mb-1" style="color: var(--ng-success)">{{ t('analytics.bestCall') }}</div>
        <div class="font-semibold">{{ data.bestCall.home }} {{ data.bestCall.actual }} {{ data.bestCall.away }}</div>
        <div class="text-xs" style="color: var(--p-text-muted-color)">{{ t('analytics.youPicked', { score: data.bestCall.predicted }) }} · +{{ data.bestCall.points }} {{ t('leaderboard.pts') }}</div>
      </div>
      <div v-if="data.worstMiss" class="ng-card rounded-xl border px-4 py-3" style="background: var(--p-content-background); border-color: var(--p-content-border-color)">
        <div class="text-xs uppercase tracking-wide mb-1" style="color: var(--ng-danger)">{{ t('analytics.worstMiss') }}</div>
        <div class="font-semibold">{{ data.worstMiss.home }} {{ data.worstMiss.actual }} {{ data.worstMiss.away }}</div>
        <div class="text-xs" style="color: var(--p-text-muted-color)">{{ t('analytics.youPicked', { score: data.worstMiss.predicted }) }}</div>
      </div>
    </section>
  </div>
</template>
