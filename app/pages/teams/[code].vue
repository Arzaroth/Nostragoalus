<script setup lang="ts">
const route = useRoute()
const { t } = useI18n()
const slug = useSelectedCompetition()
const { data } = await useFetch<{ team: { code: string; name: string } | null; matches: any[] }>(
  `/api/teams/${route.params.code}`,
  { query: computed(() => (slug.value ? { competition: slug.value } : {})) },
)

function fmt(d: string) {
  return new Date(d).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div v-if="data && data.team">
    <NuxtLink to="/matches" class="text-sm inline-flex items-center gap-1" style="color: var(--p-text-muted-color)">
      <i class="pi pi-arrow-left" /> {{ t('matches.title') }}
    </NuxtLink>
    <div class="flex items-center gap-3 mt-3 mb-6">
      <img v-if="flagUrl(data.team.code)" :src="flagUrl(data.team.code) || ''" class="w-10 h-10 rounded-lg object-cover" alt="" >
      <h1 class="text-2xl font-bold">{{ data.team.name }}</h1>
    </div>

    <div class="flex flex-col gap-3">
      <NuxtLink
        v-for="m in data.matches"
        :key="m.id"
        :to="`/matches/${m.id}`"
        class="ng-card block rounded-2xl border p-4"
        style="background: var(--p-content-background)"
      >
        <div class="flex items-center justify-between gap-2 text-xs mb-2" style="color: var(--p-text-muted-color)">
          <span>{{ m.roundLabel }} · {{ fmt(m.kickoffTime) }}</span>
          <Tag :value="matchStatusLabel(m.status)" :severity="statusSeverity(m.status)" />
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
