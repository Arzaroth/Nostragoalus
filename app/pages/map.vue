<script setup lang="ts">
const { t } = useI18n()
const slug = useSelectedCompetition()
const { data: teamsData } = await useFetch<{ teams: { code: string; name: string }[] }>('/api/competitions/teams', {
  query: computed(() => (slug.value ? { competition: slug.value } : {})),
})
const teams = computed(() => teamsData.value?.teams ?? [])

const selected = ref<{ code: string; name: string } | null>(null)
const info = ref<any>(null)
const loading = ref(false)

async function onSelect(team: { code: string; name: string }) {
  selected.value = team
  loading.value = true
  info.value = await $fetch(`/api/teams/${team.code}`, { query: slug.value ? { competition: slug.value } : {} })
  loading.value = false
}

// Switching competition invalidates the selected team.
watch(slug, () => {
  selected.value = null
  info.value = null
})

const matches = computed<any[]>(() => info.value?.matches ?? [])
const live = computed(() => matches.value.find((m) => m.status === 'LIVE' || m.status === 'PAUSED'))
const next = computed(() => matches.value.find((m) => m.status === 'SCHEDULED'))

function teamResult(m: any) {
  const isHome = m.homeTeamCode === selected.value?.code
  const gf = isHome ? m.fullTimeHome : m.fullTimeAway
  const ga = isHome ? m.fullTimeAway : m.fullTimeHome
  const pf = isHome ? m.penaltiesHome : m.penaltiesAway
  const pa = isHome ? m.penaltiesAway : m.penaltiesHome
  let result: 'W' | 'D' | 'L' = gf > ga ? 'W' : gf < ga ? 'L' : 'D'
  if (result === 'D' && pf != null && pa != null && pf !== pa) result = pf > pa ? 'W' : 'L'
  return { id: m.id, result, opponent: isHome ? m.awayTeam : m.homeTeam, opponentCode: isHome ? m.awayTeamCode : m.homeTeamCode, gf, ga }
}
const results = computed(() =>
  matches.value
    .filter((m) => m.fullTimeHome !== null)
    .slice()
    .sort((a, b) => new Date(b.kickoffTime).getTime() - new Date(a.kickoffTime).getTime())
    .map(teamResult),
)
const record = computed(() => results.value.reduce((r, x) => ((r[x.result] += 1), r), { W: 0, D: 0, L: 0 } as Record<string, number>))

function formColor(r: string) {
  return r === 'W' ? '#22c55e' : r === 'L' ? '#ef4444' : '#a1a1aa'
}
function fmt(d: string) {
  return new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold mb-5">{{ t('nav.map') }}</h1>
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2">
        <ClientOnly>
          <WorldMap :teams="teams" @select="onSelect" />
          <template #fallback>
            <div class="rounded-2xl border" style="height: 70vh; border-color: var(--p-content-border-color)" />
          </template>
        </ClientOnly>
      </div>

      <div class="ng-card rounded-2xl border p-5" style="background: var(--p-content-background)">
        <div v-if="!selected" class="opacity-60">{{ t('map.hint') }}</div>
        <div v-else>
          <div class="flex items-center gap-2 mb-4">
            <img v-if="flagUrl(selected.code)" :src="flagUrl(selected.code) || ''" class="w-8 h-8 rounded object-cover" alt="" >
            <NuxtLink :to="`/teams/${selected.code}`" class="text-lg font-bold hover:underline">{{ selected.name }}</NuxtLink>
          </div>
          <div v-if="loading" class="opacity-60">{{ t('common.loading') }}</div>
          <div v-else class="flex flex-col gap-4 text-sm">
            <div v-if="live">
              <div class="text-xs font-bold mb-1" style="color: #ef4444">● {{ t('map.live') }}</div>
              <NuxtLink :to="`/matches/${live.id}`" class="hover:underline">{{ live.homeTeam }} <b>{{ live.fullTimeHome }}–{{ live.fullTimeAway }}</b> {{ live.awayTeam }}</NuxtLink>
            </div>
            <div v-if="next">
              <div class="text-xs font-semibold mb-1" style="color: var(--p-text-muted-color)">{{ t('map.next') }}</div>
              <NuxtLink :to="`/matches/${next.id}`" class="hover:underline">{{ next.homeTeam }} vs {{ next.awayTeam }} · {{ fmt(next.kickoffTime) }}</NuxtLink>
            </div>
            <div v-if="results.length">
              <div class="text-xs font-semibold mb-2 flex items-center justify-between" style="color: var(--p-text-muted-color)">
                <span>{{ t('map.recent') }}</span>
                <span class="tabular-nums">{{ record.W }}W · {{ record.D }}D · {{ record.L }}L</span>
              </div>
              <div class="flex flex-col gap-1.5">
                <NuxtLink v-for="r in results.slice(0, 6)" :key="r.id" :to="`/matches/${r.id}`" class="flex items-center gap-2 hover:opacity-80">
                  <span class="w-4 h-4 rounded text-white text-[10px] flex items-center justify-center font-bold shrink-0" :style="`background:${formColor(r.result)}`">{{ r.result }}</span>
                  <img v-if="flagUrl(r.opponentCode)" :src="flagUrl(r.opponentCode) || ''" class="w-4 h-4 rounded shrink-0" alt="" >
                  <span class="truncate flex-1">{{ r.opponent }}</span>
                  <span class="tabular-nums shrink-0" style="color: var(--p-text-muted-color)">{{ r.gf }}–{{ r.ga }}</span>
                </NuxtLink>
              </div>
            </div>
            <div v-if="!live && !next && !results.length" class="opacity-60">{{ t('map.noData') }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
