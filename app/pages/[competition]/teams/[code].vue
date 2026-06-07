<script setup lang="ts">
const route = useRoute()
const { t } = useI18n()
const slug = useSelectedCompetition()
const { data, status } = await useFetch<{
  team: { code: string; name: string } | null
  matches: any[]
  topScorer: { playerName: string; goals: number } | null
  topAssister: { playerName: string; assists: number } | null
  teamStats: Record<string, number | null> | null
  squad: { playerId: string; name: string; shirtNumber: number | null; position: string | null; captain: boolean; goals: number; assists: number }[]
  coach: string | null
  competitions: { slug: string; name: string }[]
}>(`/api/teams/${route.params.code}`, { query: computed(() => (slug.value ? { competition: slug.value } : {})) })

const pending = computed(() => status.value === 'pending')

const statItems = computed(() => {
  const s = data.value?.teamStats
  if (!s) return []
  const it = (label: string, v: number | null | undefined, digits = 0, suffix = '') => ({
    label,
    value: v == null ? '–' : `${Number(v).toFixed(digits)}${suffix}`,
  })
  return [
    it(t('team.goals'), s.goals),
    it(t('team.conceded'), s.conceded),
    it(t('team.assists'), s.assists),
    it(t('match.possession'), s.possession, 1, '%'),
    it(t('match.attempts'), s.attempts),
    it(t('match.onTarget'), s.onTarget),
    it(t('match.passes'), s.passes),
    it(t('match.passAccuracy'), s.passAccuracy, 0, '%'),
    it(t('match.corners'), s.corners),
    it(t('team.yellow'), s.yellowCards),
    it(t('team.red'), s.redCards),
  ].filter((x) => x.value !== '–')
})

const squadGroups = computed(() => {
  const squad = data.value?.squad ?? []
  const groups: { key: string; label: string; players: typeof squad }[] = []
  for (const key of ['GK', 'DF', 'MF', 'FW', null] as const) {
    const players = squad.filter((p) => p.position === key)
    // FIFA's public feed marks bench-only outfielders as plain substitutes (no position).
    if (players.length) groups.push({ key: key ?? 'sub', label: key ? t(`pos.${key}`) : t('pos.sub'), players })
  }
  return groups
})

function outcome(m: any): 'W' | 'D' | 'L' | null {
  if (m.fullTimeHome === null || m.fullTimeAway === null) return null
  const isHome = m.homeTeamCode === data.value?.team?.code
  const gf = isHome ? m.fullTimeHome : m.fullTimeAway
  const ga = isHome ? m.fullTimeAway : m.fullTimeHome
  const pf = isHome ? m.penaltiesHome : m.penaltiesAway
  const pa = isHome ? m.penaltiesAway : m.penaltiesHome
  let r: 'W' | 'D' | 'L' = gf > ga ? 'W' : gf < ga ? 'L' : 'D'
  if (r === 'D' && pf != null && pa != null && pf !== pa) r = pf > pa ? 'W' : 'L'
  return r
}
function outcomeColor(o: string | null) {
  return o === 'W' ? '#22c55e' : o === 'L' ? '#ef4444' : o === 'D' ? '#a1a1aa' : 'var(--p-content-border-color)'
}
function fmt(d: string) {
  return new Date(d).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div v-if="data && data.team">
    <NuxtLink :to="`/${slug}/matches`" class="text-sm inline-flex items-center gap-1" style="color: var(--p-text-muted-color)">
      <i class="pi pi-arrow-left" /> {{ t('matches.title') }}
    </NuxtLink>
    <div class="flex items-center gap-3 mt-3 mb-2">
      <img v-if="flagUrl(data.team.code)" :src="flagUrl(data.team.code) || ''" class="w-10 h-10 rounded-lg object-cover" alt="" >
      <h1 class="text-2xl font-bold">{{ data.team.name }}</h1>
    </div>
    <div v-if="(data.competitions?.length ?? 0) > 1" class="flex flex-wrap gap-2 mb-3">
      <NuxtLink
        v-for="c in data.competitions"
        :key="c.slug"
        :to="`/${c.slug}/teams/${data.team.code}`"
        class="px-3 py-1 rounded-full border text-xs font-medium"
        :style="c.slug === slug
          ? 'background: var(--p-primary-color); color: var(--p-primary-contrast-color); border-color: var(--p-primary-color)'
          : 'border-color: var(--p-content-border-color); color: var(--p-text-muted-color)'"
      >
        {{ c.name }}
      </NuxtLink>
    </div>
    <div v-if="data.topScorer || data.topAssister || data.coach" class="flex flex-wrap gap-x-5 gap-y-1 text-sm mb-4" style="color: var(--p-text-muted-color)">
      <span v-if="data.coach">{{ t('team.coach') }}: <b style="color: var(--p-text-color)">{{ data.coach }}</b></span>
      <span v-if="data.topScorer">{{ t('match.topScorer') }}: <b style="color: var(--p-text-color)">{{ data.topScorer.playerName }}</b> ({{ data.topScorer.goals }}⚽)</span>
      <span v-if="data.topAssister">{{ t('match.topAssister') }}: <b style="color: var(--p-text-color)">{{ data.topAssister.playerName }}</b> ({{ data.topAssister.assists }}🅰)</span>
    </div>

    <div v-if="pending" class="flex items-center gap-2 text-sm mb-4" style="color: var(--p-text-muted-color)">
      <ProgressSpinner style="width: 20px; height: 20px" stroke-width="6" /> {{ t('common.loading') }}
    </div>

    <div class="flex flex-col gap-3" :class="{ 'opacity-50 transition-opacity': pending }">
      <NuxtLink
        v-for="m in data.matches"
        :key="m.id"
        :to="`/${slug}/matches/${m.id}`"
        class="ng-card block rounded-2xl border p-4"
        :style="`background: var(--p-content-background); border-left: 4px solid ${outcomeColor(outcome(m))}`"
      >
        <div class="flex items-center justify-between gap-2 text-xs mb-2" style="color: var(--p-text-muted-color)">
          <span>{{ m.roundLabel }} · {{ fmt(m.kickoffTime) }}</span>
          <span class="flex items-center gap-2">
            <span
              v-if="outcome(m)"
              class="w-5 h-5 rounded text-white text-[10px] flex items-center justify-center font-bold"
              :style="`background:${outcomeColor(outcome(m))}`"
            >{{ outcome(m) }}</span>
            <Tag :value="matchStatusLabel(m.status)" :severity="statusSeverity(m.status)" />
          </span>
        </div>
        <div class="flex items-center gap-2">
          <span class="flex items-center gap-2 flex-1 justify-end min-w-0">
            <span class="truncate" :class="{ 'font-bold': m.homeTeamCode === data.team.code }">{{ m.homeTeam }}</span>
            <img v-if="flagUrl(m.homeTeamCode)" :src="flagUrl(m.homeTeamCode) || ''" class="w-5 h-5 rounded" alt="" >
          </span>
          <span class="font-bold tabular-nums px-2 shrink-0 text-center">
            <template v-if="m.fullTimeHome !== null">
              {{ m.fullTimeHome }}–{{ m.fullTimeAway }}
              <span v-if="pensResult(m)" class="block text-[10px] font-normal leading-tight" style="color: var(--p-text-muted-color)">{{ pensResult(m) }} {{ t('match.pens') }}</span>
            </template>
            <template v-else>vs</template>
          </span>
          <span class="flex items-center gap-2 flex-1 min-w-0">
            <img v-if="flagUrl(m.awayTeamCode)" :src="flagUrl(m.awayTeamCode) || ''" class="w-5 h-5 rounded" alt="" >
            <span class="truncate" :class="{ 'font-bold': m.awayTeamCode === data.team.code }">{{ m.awayTeam }}</span>
          </span>
        </div>
      </NuxtLink>
    </div>
    <div v-if="!data.matches.length" class="opacity-60">{{ t('team.noMatches') }}</div>

    <section v-if="statItems.length" class="mt-8">
      <h2 class="font-semibold text-lg mb-3">{{ t('team.stats') }}</h2>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <div v-for="s in statItems" :key="s.label" class="ng-card rounded-xl border p-3 text-center" style="background: var(--p-content-background)">
          <div class="text-xl font-extrabold tabular-nums">{{ s.value }}</div>
          <div class="text-xs mt-0.5" style="color: var(--p-text-muted-color)">{{ s.label }}</div>
        </div>
      </div>
    </section>

    <section v-if="squadGroups.length" class="mt-8">
      <h2 class="font-semibold text-lg mb-3">{{ t('team.squad') }}</h2>
      <div class="ng-card rounded-2xl border overflow-hidden" style="background: var(--p-content-background)">
        <template v-for="g in squadGroups" :key="g.key">
          <div class="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider" style="background: color-mix(in srgb, var(--p-primary-color) 10%, transparent); color: var(--p-text-muted-color)">
            {{ g.label }}
          </div>
          <div v-for="p in g.players" :key="p.playerId" class="flex items-center gap-3 px-4 py-2 border-t text-sm" style="border-color: var(--p-content-border-color)">
            <span class="w-7 text-center tabular-nums font-bold" style="color: var(--p-text-muted-color)">{{ p.shirtNumber ?? '–' }}</span>
            <span class="flex-1 font-medium truncate">{{ p.name }}<span v-if="p.captain" class="ml-1 text-xs" style="color: var(--p-primary-color)" title="Captain">©</span></span>
            <span v-if="p.goals" class="text-xs tabular-nums shrink-0">{{ p.goals }}⚽</span>
            <span v-if="p.assists" class="text-xs tabular-nums shrink-0">{{ p.assists }}🅰</span>
          </div>
        </template>
      </div>
    </section>
  </div>
  <div v-else class="opacity-60">{{ t('team.notFound') }}</div>
</template>
