<script setup lang="ts">
const { t, locale } = useI18n()
useHead({ title: t('nav.map') })
const slug = useSelectedCompetition()
// Crowd-lean overlay: tint each nation by where the field expects its current
// match to go. Reuses the same aggregate crowd totals (and live WS patches) as
// the "show everyone's totals" preference, so it is gated on that same opt-in.
// These composables register effect scope + lifecycle hooks (vue-query, the
// reconnecting socket), so they MUST run before the awaited fetch below: after an
// await the active component instance is gone and the wiring fails to register.
const { data: allMatches } = useMatches()
// Subscribe the match list to live updates here too, so a match finishing
// mid-session advances its teams to their next fixture instead of staying tinted.
useLiveMatches(allMatches)
const { totals: crowdTotals, enabled: crowdEnabled } = useCrowdTotals()
const teamLean = computed(() =>
  crowdEnabled.value ? computeTeamLean(allMatches.value ?? [], crowdTotals.value) : {},
)
// Teams certainly out of the tournament are greyed on the map (server-computed
// from the competition's group tiebreaker rules + knockout results). Refetched as
// results land - the match list is live-patched here via useLiveMatches.
const { data: elimData, refresh: refreshEliminated } = useFetch<{ codes: string[] }>('/api/competitions/eliminated', {
  query: computed(() => (slug.value ? { competition: slug.value } : {})),
})
// Only swap the Set when the codes actually change, so a refetch that returns the
// same set doesn't churn a full marker rebuild (and flag-image reload) in WorldMap.
const eliminated = ref<Set<string>>(new Set())
watch(
  () => [...(elimData.value?.codes ?? [])].sort().join(','),
  (sig) => (eliminated.value = new Set(sig ? sig.split(',') : [])),
  { immediate: true },
)
// A finished match can change who's out; refetch when any match's status flips.
watch(
  () => (allMatches.value ?? []).map((m) => m.status).join(','),
  () => refreshEliminated(),
)

const { data: teamsData } = await useFetch<{ teams: { code: string; name: string }[] }>('/api/competitions/teams', {
  query: computed(() => (slug.value ? { competition: slug.value } : {})),
})
const teams = computed(() => teamsData.value?.teams ?? [])

const route = useRoute()
const router = useRouter()
const mapRef = ref<{ centerOn: (code: string) => void } | null>(null)

const selected = ref<{ code: string; name: string } | null>(null)
const info = ref<any>(null)
const loading = ref(false)

// Monotonic token: a slow response for a previously selected team must not
// overwrite the panel of the currently selected one.
let reqSeq = 0
async function onSelect(team: { code: string; name: string }) {
  selected.value = team
  // Shareable URLs: the selected team rides along as ?team=XXX.
  if (route.query.team !== team.code) void router.replace({ query: { ...route.query, team: team.code } })
  const my = ++reqSeq
  loading.value = true
  info.value = null
  try {
    // lite=1: the panel doesn't need the squad/stats sweep - keeps it snappy.
    const res = await $fetch<any>(`/api/teams/${team.code}`, {
      query: { ...(slug.value ? { competition: slug.value } : {}), lite: '1' },
    })
    if (my !== reqSeq) return
    info.value = res
  } finally {
    if (my === reqSeq) loading.value = false
  }
}

function selectByCode(code: string | undefined | null, center = true) {
  const team = code ? teams.value.find((tm) => tm.code === code) : null
  if (!team) return false
  void onSelect(team)
  if (center) mapRef.value?.centerOn(team.code)
  return true
}

// On load and on competition switch: keep (or restore from the URL) the selected
// team when it exists in the current competition, otherwise clear it.
watch(
  teams,
  () => {
    const want = selected.value?.code ?? (route.query.team as string | undefined)
    if (!selectByCode(want)) {
      selected.value = null
      info.value = null
      if (route.query.team) void router.replace({ query: { ...route.query, team: undefined } })
    }
  },
  { immediate: true },
)

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
  const pens = pf != null && pa != null && pf + pa > 0 ? `${pf}–${pa}` : null
  return { id: m.id, result, opponent: isHome ? m.awayTeam : m.homeTeam, opponentCode: isHome ? m.awayTeamCode : m.homeTeamCode, gf, ga, pens }
}
const results = computed(() =>
  matches.value
    .filter((m) => m.fullTimeHome !== null)
    .slice()
    .sort((a, b) => new Date(b.kickoffTime).getTime() - new Date(a.kickoffTime).getTime())
    .map(teamResult),
)
const record = computed(() => results.value.reduce((r, x) => ((r[x.result] += 1), r), { W: 0, D: 0, L: 0 } as Record<string, number>))
const topScorer = computed(() => info.value?.topScorer ?? null)
const topAssister = computed(() => info.value?.topAssister ?? null)
const standings = computed<any[]>(() => info.value?.standings ?? [])

function formColor(r: string) {
  return r === 'W' ? 'var(--ng-success)' : r === 'L' ? 'var(--ng-danger)' : '#a1a1aa'
}
function fmt(d: string) {
  return new Date(d).toLocaleString(locale.value, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-3 flex-wrap mb-5">
      <h1 class="text-2xl font-bold">{{ t('nav.map') }}</h1>
      <div class="flex items-center gap-2 flex-wrap">
        <CompetitionPill />
      </div>
    </div>
    <div class="grid lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2">
        <!-- WorldMap is a .client component (Leaflet needs the browser); it is
        already client-only by filename. Wrapping it in <ClientOnly> on top of
        that left the fallback mounted and the map never hydrated in the prod
        build - render it directly. -->
        <WorldMap ref="mapRef" :teams="teams" :team-lean="teamLean" :eliminated="eliminated" @select="onSelect" />
        <NuxtLink
          v-if="!crowdEnabled"
          to="/preferences"
          class="block text-xs mt-2 hover:underline"
          style="color: var(--p-text-muted-color)"
        >
          <i class="pi pi-info-circle" /> {{ t('map.lean.hint') }}
        </NuxtLink>
      </div>

      <div class="ng-card rounded-2xl border p-5" style="background: var(--p-content-background)">
        <div v-if="!selected" class="opacity-60">{{ t('map.hint') }}</div>
        <div v-else>
          <div class="flex items-center gap-2 mb-4">
            <img v-if="flagUrl(selected.code)" :src="flagUrl(selected.code) || ''" class="w-8 h-8 rounded object-cover" alt="" >
            <NuxtLink :to="`/${slug}/teams/${selected.code}`" class="text-lg font-bold hover:underline">{{ selected.name }}</NuxtLink>
          </div>
          <div v-if="loading" class="flex flex-col items-center gap-2 py-10">
            <ProgressSpinner style="width: 44px; height: 44px" stroke-width="5" />
            <span class="text-xs" style="color: var(--p-text-muted-color)">{{ t('common.loading') }}</span>
          </div>
          <div v-else class="flex flex-col gap-4 text-sm">
            <div v-if="topScorer || topAssister" class="flex flex-col gap-1">
              <div v-if="topScorer" class="flex items-center justify-between gap-2">
                <span style="color: var(--p-text-muted-color)">{{ t('match.topScorer') }}</span>
                <span class="font-medium truncate">{{ formatPlayerName(topScorer.playerName) }} <span class="tabular-nums">({{ topScorer.goals }}⚽)</span></span>
              </div>
              <div v-if="topAssister" class="flex items-center justify-between gap-2">
                <span style="color: var(--p-text-muted-color)">{{ t('match.topAssister') }}</span>
                <span class="font-medium truncate">{{ formatPlayerName(topAssister.playerName) }} <span class="tabular-nums">({{ topAssister.assists }}👟)</span></span>
              </div>
            </div>

            <div v-if="standings.length">
              <div class="text-xs font-semibold mb-1" style="color: var(--p-text-muted-color)">{{ t('map.group') }} {{ info.group }}</div>
              <table class="w-full text-xs">
                <tbody>
                  <tr
                    v-for="(row, i) in standings"
                    :key="row.name"
                    :class="{ 'cursor-pointer hover:opacity-75': row.code && row.code !== selected.code }"
                    :style="row.code === selected.code ? 'background: color-mix(in srgb, var(--p-primary-color) 14%, transparent)' : ''"
                    @click="row.code && row.code !== selected.code && selectByCode(row.code)"
                  >
                    <td class="py-0.5 pl-1 w-4" style="color: var(--p-text-muted-color)">{{ i + 1 }}</td>
                    <td class="py-0.5">
                      <span class="flex items-center gap-1">
                        <img v-if="flagUrl(row.code)" :src="flagUrl(row.code) || ''" class="w-3.5 h-3.5 rounded" alt="" >{{ row.code || row.name }}
                      </span>
                    </td>
                    <td class="py-0.5 text-right tabular-nums" style="color: var(--p-text-muted-color)">{{ row.played }}</td>
                    <td class="py-0.5 pr-1 text-right tabular-nums font-bold">{{ row.points }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-if="live">
              <div class="text-xs font-bold mb-1" style="color: var(--ng-danger)">● {{ t('map.live') }}</div>
              <NuxtLink :to="`/${slug}/matches/${live.id}`" class="hover:underline">{{ live.homeTeam }} <b>{{ live.fullTimeHome }}–{{ live.fullTimeAway }}</b> {{ live.awayTeam }}</NuxtLink>
            </div>
            <div v-if="next">
              <div class="text-xs font-semibold mb-1" style="color: var(--p-text-muted-color)">{{ t('map.next') }}</div>
              <NuxtLink :to="`/${slug}/matches/${next.id}`" class="hover:underline">{{ next.homeTeam }} vs {{ next.awayTeam }} · {{ fmt(next.kickoffTime) }}</NuxtLink>
            </div>
            <div v-if="results.length">
              <div class="text-xs font-semibold mb-2 flex items-center justify-between" style="color: var(--p-text-muted-color)">
                <span>{{ t('map.recent') }}</span>
                <span class="tabular-nums">{{ record.W }}W · {{ record.D }}D · {{ record.L }}L</span>
              </div>
              <div class="flex flex-col gap-1.5">
                <NuxtLink v-for="r in results" :key="r.id" :to="`/${slug}/matches/${r.id}`" class="flex items-center gap-2 hover:opacity-80">
                  <span class="w-4 h-4 rounded text-white text-[10px] flex items-center justify-center font-bold shrink-0" :style="`background:${formColor(r.result)}`">{{ r.result }}</span>
                  <img v-if="flagUrl(r.opponentCode)" :src="flagUrl(r.opponentCode) || ''" class="w-4 h-4 rounded shrink-0" alt="" >
                  <span class="truncate flex-1">{{ r.opponent }}</span>
                  <span class="tabular-nums shrink-0" style="color: var(--p-text-muted-color)">{{ r.gf }}–{{ r.ga }}<template v-if="r.pens"> ({{ r.pens }} {{ t('match.pens') }})</template></span>
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
