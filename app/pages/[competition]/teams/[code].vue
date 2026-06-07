<script setup lang="ts">
const route = useRoute()
const { t } = useI18n()
const slug = useSelectedCompetition()
const { data } = await useFetch<{
  team: { code: string; name: string } | null
  matches: any[]
  topScorer: { playerName: string; goals: number } | null
  topAssister: { playerName: string; assists: number } | null
}>(`/api/teams/${route.params.code}`, { query: computed(() => (slug.value ? { competition: slug.value } : {})) })

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
    <div v-if="data.topScorer || data.topAssister" class="flex flex-wrap gap-x-5 gap-y-1 text-sm mb-6" style="color: var(--p-text-muted-color)">
      <span v-if="data.topScorer">{{ t('match.topScorer') }}: <b style="color: var(--p-text-color)">{{ data.topScorer.playerName }}</b> ({{ data.topScorer.goals }}⚽)</span>
      <span v-if="data.topAssister">{{ t('match.topAssister') }}: <b style="color: var(--p-text-color)">{{ data.topAssister.playerName }}</b> ({{ data.topAssister.assists }}🅰)</span>
    </div>

    <div class="flex flex-col gap-3">
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
          <span class="font-bold tabular-nums px-2 shrink-0">
            <template v-if="m.fullTimeHome !== null">{{ m.fullTimeHome }}–{{ m.fullTimeAway }}</template>
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
  </div>
  <div v-else class="opacity-60">{{ t('team.notFound') }}</div>
</template>
