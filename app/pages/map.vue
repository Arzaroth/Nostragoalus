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

const matches = computed<any[]>(() => info.value?.matches ?? [])
const live = computed(() => matches.value.find((m) => m.status === 'LIVE' || m.status === 'PAUSED'))
const next = computed(() => matches.value.find((m) => m.status === 'SCHEDULED'))
const last = computed(() => [...matches.value].reverse().find((m) => m.fullTimeHome !== null))

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
          <div v-else class="flex flex-col gap-3 text-sm">
            <div v-if="live">
              <div class="text-xs font-bold mb-1" style="color: #ef4444">● {{ t('map.live') }}</div>
              <NuxtLink :to="`/matches/${live.id}`" class="hover:underline">{{ live.homeTeam }} <b>{{ live.fullTimeHome }}–{{ live.fullTimeAway }}</b> {{ live.awayTeam }}</NuxtLink>
            </div>
            <div v-if="next">
              <div class="text-xs font-semibold mb-1" style="color: var(--p-text-muted-color)">{{ t('map.next') }}</div>
              <NuxtLink :to="`/matches/${next.id}`" class="hover:underline">{{ next.homeTeam }} vs {{ next.awayTeam }} · {{ fmt(next.kickoffTime) }}</NuxtLink>
            </div>
            <div v-if="last">
              <div class="text-xs font-semibold mb-1" style="color: var(--p-text-muted-color)">{{ t('map.last') }}</div>
              <NuxtLink :to="`/matches/${last.id}`" class="hover:underline">{{ last.homeTeam }} {{ last.fullTimeHome }}–{{ last.fullTimeAway }} {{ last.awayTeam }}</NuxtLink>
            </div>
            <div v-if="!live && !next && !last" class="opacity-60">{{ t('map.noData') }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
