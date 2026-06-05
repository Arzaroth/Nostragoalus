<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()
const id = computed(() => route.params.id as string)

const { data } = await useFetch<{
  match: {
    id: string
    homeTeam: string
    awayTeam: string
    homeTeamCode: string | null
    awayTeamCode: string | null
    kickoffTime: string
    status: string
    fullTimeHome: number | null
    fullTimeAway: number | null
    group: string | null
    roundLabel: string
  }
}>(`/api/matches/${id.value}`)
const { data: insights } = await useFetch<any>(`/api/matches/${id.value}/insights`)

const m = computed(() => data.value?.match)
const { live } = useLiveMatch(id)

const status = computed(() => live.value?.status ?? m.value?.status ?? 'SCHEDULED')
const homeScore = computed(() => live.value?.fullTimeHome ?? m.value?.fullTimeHome ?? null)
const awayScore = computed(() => live.value?.fullTimeAway ?? m.value?.fullTimeAway ?? null)
const isLive = computed(() => status.value === 'LIVE' || status.value === 'PAUSED')

const sides = ['home', 'away'] as const
function formColor(r: string) {
  return r === 'W' ? '#22c55e' : r === 'L' ? '#ef4444' : '#a1a1aa'
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' })
}
</script>

<template>
  <div v-if="m" class="flex flex-col gap-6">
    <NuxtLink to="/matches" class="text-sm inline-flex items-center gap-1" style="color: var(--p-text-muted-color)">
      <i class="pi pi-arrow-left" /> {{ t('common.back') }}
    </NuxtLink>

    <div class="rounded-2xl border p-6" style="background: var(--p-content-background); border-color: var(--p-content-border-color)">
      <div class="flex items-center justify-between text-xs mb-4" style="color: var(--p-text-muted-color)">
        <span>{{ m.roundLabel }}<template v-if="m.group"> · Group {{ m.group }}</template></span>
        <span class="flex items-center gap-2">
          <span v-if="isLive" class="flex items-center gap-1 font-semibold" style="color: #ef4444">
            <span class="w-2 h-2 rounded-full animate-pulse" style="background: #ef4444" /> LIVE
          </span>
          <Tag :value="matchStatusLabel(status)" :severity="statusSeverity(status)" />
        </span>
      </div>

      <div class="flex items-center justify-around gap-4">
        <div class="flex flex-col items-center gap-2 flex-1">
          <img v-if="flagUrl(m.homeTeamCode)" :src="flagUrl(m.homeTeamCode) || ''" class="w-16 h-16 rounded-lg object-cover" alt="" >
          <span class="font-bold text-center">{{ m.homeTeam }}</span>
        </div>
        <div class="text-center min-w-24">
          <div v-if="homeScore !== null" class="text-5xl font-extrabold tabular-nums">{{ homeScore }}–{{ awayScore }}</div>
          <div v-else class="text-sm" style="color: var(--p-text-muted-color)">{{ new Date(m.kickoffTime).toLocaleString() }}</div>
        </div>
        <div class="flex flex-col items-center gap-2 flex-1">
          <img v-if="flagUrl(m.awayTeamCode)" :src="flagUrl(m.awayTeamCode) || ''" class="w-16 h-16 rounded-lg object-cover" alt="" >
          <span class="font-bold text-center">{{ m.awayTeam }}</span>
        </div>
      </div>
    </div>

    <div v-if="insights" class="rounded-2xl border p-2 sm:p-4" style="background: var(--p-content-background); border-color: var(--p-content-border-color)">
      <Tabs value="form">
        <TabList>
          <Tab v-if="insights.standings" value="standings">{{ t('match.standings') }}</Tab>
          <Tab value="form">{{ t('match.form') }}</Tab>
          <Tab value="next">{{ t('match.next') }}</Tab>
          <Tab v-if="insights.headToHead.length" value="h2h">{{ t('match.h2h') }}</Tab>
        </TabList>
        <TabPanels>
          <TabPanel v-if="insights.standings" value="standings">
            <table class="w-full text-sm">
              <thead>
                <tr style="color: var(--p-text-muted-color)" class="text-center">
                  <th class="py-1 text-left">#</th>
                  <th class="text-left">Team</th>
                  <th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in insights.standings" :key="row.name" class="border-t text-center" style="border-color: var(--p-content-border-color)">
                  <td class="py-2 text-left">{{ i + 1 }}</td>
                  <td class="text-left">
                    <span class="flex items-center gap-2">
                      <img v-if="flagUrl(row.code)" :src="flagUrl(row.code) || ''" class="w-5 h-5 rounded" alt="" >{{ row.name }}
                    </span>
                  </td>
                  <td>{{ row.played }}</td><td>{{ row.won }}</td><td>{{ row.drawn }}</td><td>{{ row.lost }}</td>
                  <td>{{ row.gd > 0 ? '+' : '' }}{{ row.gd }}</td>
                  <td class="font-bold">{{ row.points }}</td>
                </tr>
              </tbody>
            </table>
          </TabPanel>

          <TabPanel value="form">
            <div class="grid sm:grid-cols-2 gap-6">
              <div v-for="side in sides" :key="side">
                <div class="font-semibold mb-2">{{ side === 'home' ? m.homeTeam : m.awayTeam }}</div>
                <div v-if="insights.form[side].length" class="flex flex-col gap-1.5">
                  <div v-for="(f, i) in insights.form[side]" :key="i" class="flex items-center gap-2 text-sm">
                    <span class="w-5 h-5 rounded text-white text-xs flex items-center justify-center font-bold" :style="`background:${formColor(f.result)}`">{{ f.result }}</span>
                    <span style="color: var(--p-text-muted-color)">vs {{ f.opponent }}</span>
                    <span class="font-medium tabular-nums">{{ f.score }}</span>
                  </div>
                </div>
                <div v-else class="text-sm" style="color: var(--p-text-muted-color)">{{ t('match.noResults') }}</div>
              </div>
            </div>
          </TabPanel>

          <TabPanel value="next">
            <div class="grid sm:grid-cols-2 gap-6">
              <div v-for="side in sides" :key="side">
                <div class="font-semibold mb-2">{{ side === 'home' ? m.homeTeam : m.awayTeam }}</div>
                <div v-if="insights.next[side].length" class="flex flex-col gap-1.5 text-sm">
                  <div v-for="(n, i) in insights.next[side]" :key="i" class="flex items-center gap-2">
                    <span style="color: var(--p-text-muted-color)">{{ fmtDate(n.kickoffTime) }}</span>
                    <span style="color: var(--p-text-muted-color)">vs</span>
                    <img v-if="flagUrl(n.opponentCode)" :src="flagUrl(n.opponentCode) || ''" class="w-4 h-4 rounded" alt="" >{{ n.opponent }}
                  </div>
                </div>
                <div v-else class="text-sm" style="color: var(--p-text-muted-color)">{{ t('match.noUpcoming') }}</div>
              </div>
            </div>
          </TabPanel>

          <TabPanel v-if="insights.headToHead.length" value="h2h">
            <div class="flex flex-col text-sm">
              <div v-for="(h, i) in insights.headToHead" :key="i" class="flex items-center justify-between border-t py-2" style="border-color: var(--p-content-border-color)">
                <span class="font-medium">{{ h.homeTeam }} {{ h.homeScore }}–{{ h.awayScore }} {{ h.awayTeam }}</span>
                <span style="color: var(--p-text-muted-color)">{{ fmtDate(h.kickoffTime) }}</span>
              </div>
            </div>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  </div>
  <div v-else class="opacity-60">Match not found.</div>
</template>
