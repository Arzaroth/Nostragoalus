<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()
const id = computed(() => route.params.id as string)
const NuxtLinkC = resolveComponent('NuxtLink')

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
    penaltiesHome: number | null
    penaltiesAway: number | null
    group: string | null
    roundLabel: string
  }
}>(`/api/matches/${id.value}`)
const { data: insights } = await useFetch<any>(`/api/matches/${id.value}/insights`)

const selectedSlug = useSelectedCompetition()
const { data: scorersData } = await useFetch<{ scorers: any[] }>('/api/competitions/scorers', {
  query: computed(() => (selectedSlug.value ? { competition: selectedSlug.value } : {})),
})
const scorers = computed<any[]>(() => scorersData.value?.scorers ?? [])

const { data: detailData } = await useFetch<{ detail: any }>(`/api/matches/${id.value}/live-detail`)
const detail = computed(() => detailData.value?.detail)

const m = computed(() => data.value?.match)
const { live } = useLiveMatch(id)

const status = computed(() => live.value?.status ?? m.value?.status ?? 'SCHEDULED')
const homeScore = computed(() => live.value?.fullTimeHome ?? m.value?.fullTimeHome ?? null)
const awayScore = computed(() => live.value?.fullTimeAway ?? m.value?.fullTimeAway ?? null)
const isLive = computed(() => status.value === 'LIVE' || status.value === 'PAUSED')

const sides = ['home', 'away'] as const

function teamCodeFor(side: 'home' | 'away') {
  return side === 'home' ? m.value?.homeTeamCode : m.value?.awayTeamCode
}
function teamPlayers(side: 'home' | 'away') {
  const code = teamCodeFor(side)
  return code ? scorers.value.filter((s) => s.teamCode === code) : []
}
function bestBy(side: 'home' | 'away', field: 'goals' | 'assists') {
  return teamPlayers(side)
    .filter((s) => (s[field] ?? 0) > 0)
    .slice()
    .sort((a, b) => (b[field] ?? 0) - (a[field] ?? 0))[0] ?? null
}
const homeGoalEvents = computed(() => (insights.value?.goals ?? []).filter((g: any) => g.side === 'HOME'))
const awayGoalEvents = computed(() => (insights.value?.goals ?? []).filter((g: any) => g.side === 'AWAY'))
const hasStats = computed(
  () => homeGoalEvents.value.length > 0 || awayGoalEvents.value.length > 0 || insights.value?.possession?.home != null || !!detail.value,
)
function formColor(r: string) {
  return r === 'W' ? '#22c55e' : r === 'L' ? '#ef4444' : '#a1a1aa'
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' })
}
</script>

<template>
  <div v-if="m" class="flex flex-col gap-6">
    <NuxtLink :to="`/${selectedSlug}/matches`" class="text-sm inline-flex items-center gap-1" style="color: var(--p-text-muted-color)">
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
          <component :is="m.homeTeamCode ? NuxtLinkC : 'span'" :to="m.homeTeamCode ? `/${selectedSlug}/teams/${m.homeTeamCode}` : undefined" class="font-bold text-center hover:underline" :title="m.homeTeam">{{ m.homeTeam }}</component>
        </div>
        <div class="text-center min-w-24">
          <div v-if="homeScore !== null" class="text-5xl font-extrabold tabular-nums">{{ homeScore }}–{{ awayScore }}</div>
          <div v-else class="text-sm" style="color: var(--p-text-muted-color)">{{ new Date(m.kickoffTime).toLocaleString() }}</div>
          <div v-if="m.penaltiesHome !== null" class="text-sm font-semibold mt-1" style="color: var(--p-text-muted-color)">{{ m.penaltiesHome }}–{{ m.penaltiesAway }} {{ t('match.pens') }}</div>
        </div>
        <div class="flex flex-col items-center gap-2 flex-1">
          <img v-if="flagUrl(m.awayTeamCode)" :src="flagUrl(m.awayTeamCode) || ''" class="w-16 h-16 rounded-lg object-cover" alt="" >
          <component :is="m.awayTeamCode ? NuxtLinkC : 'span'" :to="m.awayTeamCode ? `/${selectedSlug}/teams/${m.awayTeamCode}` : undefined" class="font-bold text-center hover:underline" :title="m.awayTeam">{{ m.awayTeam }}</component>
        </div>
      </div>

      <div v-if="homeGoalEvents.length || awayGoalEvents.length" class="grid grid-cols-2 gap-4 mt-4 pt-3 border-t text-xs" style="color: var(--p-text-muted-color); border-color: var(--p-content-border-color)">
        <div class="flex flex-col items-end gap-0.5 text-right">
          <span v-for="(g, i) in homeGoalEvents" :key="i">{{ g.playerName }} {{ g.minute }}<span v-if="g.ownGoal"> (OG)</span> ⚽</span>
        </div>
        <div class="flex flex-col items-start gap-0.5">
          <span v-for="(g, i) in awayGoalEvents" :key="i">⚽ {{ g.minute }} {{ g.playerName }}<span v-if="g.ownGoal"> (OG)</span></span>
        </div>
      </div>
    </div>

    <div v-if="insights" class="rounded-2xl border p-2 sm:p-4" style="background: var(--p-content-background); border-color: var(--p-content-border-color)">
      <Tabs value="form">
        <TabList>
          <Tab v-if="hasStats" value="stats">{{ t('match.stats') }}</Tab>
          <Tab v-if="insights.standings" value="standings">{{ t('match.standings') }}</Tab>
          <Tab value="form">{{ t('match.form') }}</Tab>
          <Tab value="next">{{ t('match.next') }}</Tab>
          <Tab v-if="insights.headToHead.length" value="h2h">{{ t('match.h2h') }}</Tab>
          <Tab v-if="scorers.length" value="scorers">{{ t('match.players') }}</Tab>
        </TabList>
        <TabPanels>
          <TabPanel v-if="hasStats" value="stats">
            <div v-if="detail" class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs mb-4" style="color: var(--p-text-muted-color)">
              <span v-if="detail.stadium" class="inline-flex items-center gap-1"><i class="pi pi-map-marker" /> {{ detail.stadium }}</span>
              <span v-if="detail.attendance" class="inline-flex items-center gap-1"><i class="pi pi-users" /> {{ detail.attendance.toLocaleString() }}</span>
              <span class="inline-flex items-center gap-1"><span class="inline-block w-2.5 h-3.5 rounded-sm" style="background: #eab308" />{{ detail.cards.home.yellow }}–{{ detail.cards.away.yellow }}</span>
              <span v-if="detail.cards.home.red || detail.cards.away.red" class="inline-flex items-center gap-1"><span class="inline-block w-2.5 h-3.5 rounded-sm" style="background: #ef4444" />{{ detail.cards.home.red }}–{{ detail.cards.away.red }}</span>
            </div>
            <div v-if="insights.possession.home !== null" class="mb-4">
              <div class="flex justify-between text-xs mb-1" style="color: var(--p-text-muted-color)">
                <span>{{ Math.round(insights.possession.home) }}%</span>
                <span>{{ t('match.possession') }}</span>
                <span>{{ Math.round(insights.possession.away) }}%</span>
              </div>
              <div class="flex h-2 rounded overflow-hidden">
                <div :style="`width:${insights.possession.home}%; background: var(--p-primary-color)`" />
                <div :style="`width:${insights.possession.away}%; background: var(--p-content-border-color)`" />
              </div>
            </div>
            <div class="flex flex-col text-sm">
              <div v-for="(g, i) in insights.goals" :key="i" class="flex items-center gap-2 border-t py-2" style="border-color: var(--p-content-border-color)">
                <i class="pi pi-circle-fill text-xs" :style="`color:${g.side === 'HOME' ? 'var(--p-primary-color)' : 'var(--p-text-muted-color)'}`" />
                <span class="w-10 tabular-nums" style="color: var(--p-text-muted-color)">{{ g.minute }}</span>
                <span class="font-medium">{{ g.playerName }}</span>
                <span v-if="g.ownGoal" class="text-xs">(OG)</span>
                <span v-if="g.assistPlayerName" class="text-xs" style="color: var(--p-text-muted-color)">· {{ g.assistPlayerName }}</span>
                <span class="flex-1" />
                <span style="color: var(--p-text-muted-color)">{{ g.teamCode || g.teamName }}</span>
              </div>
            </div>
          </TabPanel>

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
                <tr
                  v-for="(row, i) in insights.standings"
                  :key="row.name"
                  class="border-t text-center"
                  :style="`border-color: var(--p-content-border-color)${row.code === m.homeTeamCode || row.code === m.awayTeamCode ? '; background: color-mix(in srgb, var(--p-primary-color) 14%, transparent)' : ''}`"
                >
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

          <TabPanel v-if="scorers.length" value="scorers">
            <div class="grid sm:grid-cols-2 gap-6">
              <div v-for="side in sides" :key="side">
                <div class="font-semibold mb-2 flex items-center gap-2">
                  <img v-if="flagUrl(teamCodeFor(side))" :src="flagUrl(teamCodeFor(side)) || ''" class="w-5 h-5 rounded" alt="" >
                  {{ side === 'home' ? m.homeTeam : m.awayTeam }}
                </div>
                <div v-if="teamPlayers(side).length" class="text-sm flex flex-col gap-1">
                  <div style="color: var(--p-text-muted-color)">
                    {{ t('match.topScorer') }}: <b style="color: var(--p-text-color)">{{ bestBy(side, 'goals')?.playerName ?? '—' }}</b><span v-if="bestBy(side, 'goals')"> ({{ bestBy(side, 'goals').goals }}⚽)</span>
                  </div>
                  <div style="color: var(--p-text-muted-color)">
                    {{ t('match.topAssister') }}: <b style="color: var(--p-text-color)">{{ bestBy(side, 'assists')?.playerName ?? '—' }}</b><span v-if="bestBy(side, 'assists')"> ({{ bestBy(side, 'assists').assists }}🅰)</span>
                  </div>
                  <div class="border-t mt-1 pt-2 flex flex-col gap-1" style="border-color: var(--p-content-border-color)">
                    <div v-for="(p, i) in teamPlayers(side)" :key="i" class="flex items-center justify-between gap-2">
                      <span class="truncate">{{ p.playerName }}</span>
                      <span class="tabular-nums shrink-0" style="color: var(--p-text-muted-color)">{{ p.goals }}⚽ · {{ p.assists }}🅰</span>
                    </div>
                  </div>
                </div>
                <div v-else class="text-sm" style="color: var(--p-text-muted-color)">—</div>
              </div>
            </div>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  </div>
  <div v-else class="opacity-60">Match not found.</div>
</template>
