<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const id = computed(() => route.params.id as string)
const NuxtLinkC = resolveComponent('NuxtLink')

const { data, refresh: refreshMatch } = await useFetch<{
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
  myPrediction: { homeGoals: number; awayGoals: number; isJoker: boolean; totalPoints: number | null; baseTier: string | null } | null
  isLocked: boolean
}>(`/api/matches/${id.value}`)
// lazy: the page navigates immediately on the core match fetch; insight/stat
// sections fill in as their (slower, FIFA-backed) data lands.
const { data: insights, status: insightsStatus } = await useFetch<any>(`/api/matches/${id.value}/insights`, { lazy: true })

const selectedSlug = useSelectedCompetition()
const { data: scorersData } = await useFetch<{ scorers: any[] }>('/api/competitions/scorers', {
  query: computed(() => (selectedSlug.value ? { competition: selectedSlug.value } : {})),
  lazy: true,
})
const scorers = computed<any[]>(() => scorersData.value?.scorers ?? [])

const { data: detailData, status: detailStatus } = await useFetch<{ detail: any }>(`/api/matches/${id.value}/live-detail`, { lazy: true })
const detail = computed(() => detailData.value?.detail)

const m = computed(() => data.value?.match)
const { live } = useLiveMatch(id)

// Your pick, editable in place until kickoff.
const myPred = computed(() => data.value?.myPrediction ?? null)
const predLocked = computed(() => data.value?.isLocked ?? true)
const canPredict = computed(() => !predLocked.value && !!m.value?.homeTeamCode && !!m.value?.awayTeamCode)
const { upsert } = usePredictionMutations()
function savePrediction(v: { home: number; away: number }) {
  upsert.mutate({ matchId: id.value, home: v.home, away: v.away }, { onSuccess: () => refreshMatch() })
}

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
  // Contributors only - a full roster of 0-0 rows is noise here.
  return code
    ? scorers.value
        .filter((s) => s.teamCode === code && ((s.goals ?? 0) > 0 || (s.assists ?? 0) > 0))
        .sort((a, b) => (b.goals ?? 0) - (a.goals ?? 0) || (b.assists ?? 0) - (a.assists ?? 0))
    : []
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
const hadShootout = computed(() => ((m.value?.penaltiesHome ?? 0) + (m.value?.penaltiesAway ?? 0)) > 0)

function minuteVal(minute: string | null): number {
  if (!minute) return Number.MAX_SAFE_INTEGER
  const match2 = /^(\d+)'(?:\+(\d+))?/.exec(minute)
  return match2 ? Number(match2[1]) * 100 + Number(match2[2] ?? 0) : Number.MAX_SAFE_INTEGER
}
function cardEvents(side: 'HOME' | 'AWAY') {
  return (detail.value?.bookings ?? []).filter((b: any) => b.side === side)
}
// Goals arrive with insights, cards with the live detail - show the timeline only
// once both have settled so events don't pop in piecemeal.
const eventsReady = computed(() => insightsStatus.value !== 'pending' && detailStatus.value !== 'pending')
// Goals + bookings interleaved chronologically.
// Timeline visibility toggles, remembered across visits.
const showBookings = useLocalStorage('ng-timeline-bookings', true)
const showSubs = useLocalStorage('ng-timeline-subs', true)

const timeline = computed(() => {
  const goals = (insights.value?.goals ?? []).map((g: any) => ({ kind: 'goal' as const, ...g }))
  const cards = (detail.value?.bookings ?? []).map((b: any) => ({
    kind: 'card' as const,
    card: b.card as 'YELLOW' | 'SECOND_YELLOW' | 'RED',
    side: b.side,
    minute: b.minute,
    playerName: b.playerName,
    coach: !!b.coach,
    teamCode: b.side === 'HOME' ? m.value?.homeTeamCode : m.value?.awayTeamCode,
  }))
  const subs = (detail.value?.substitutions ?? []).map((sub: any) => ({
    kind: 'sub' as const,
    side: sub.side,
    minute: sub.minute,
    playerName: sub.playerOnName,
    offName: sub.playerOffName,
  }))
  return [
    ...goals,
    ...(showBookings.value ? cards : []),
    ...(showSubs.value ? subs : []),
  ].sort((a, b) => minuteVal(a.minute) - minuteVal(b.minute))
})
const hasTimelineExtras = computed(() => (detail.value?.bookings?.length ?? 0) > 0 || (detail.value?.substitutions?.length ?? 0) > 0)
// FIFA football-intelligence per-match stat rows (home | label | away).
const statRows = computed(() => {
  const h = detail.value?.stats?.home as Record<string, number | null> | null | undefined
  const a = detail.value?.stats?.away as Record<string, number | null> | null | undefined
  if (!h && !a) return []
  const fmt = (v: number | null | undefined, digits = 0, suffix = '') => (v == null ? '–' : `${v.toFixed(digits)}${suffix}`)
  const acc = (s?: Record<string, number | null> | null) =>
    s?.passes && s?.passesCompleted ? `${((s.passesCompleted / s.passes) * 100).toFixed(0)}%` : '–'
  const row = (label: string, key: string, digits = 0, suffix = '') => ({ label, home: fmt(h?.[key], digits, suffix), away: fmt(a?.[key], digits, suffix) })
  return [
    row(t('match.attempts'), 'attempts'),
    row(t('match.onTarget'), 'onTarget'),
    row(t('match.passes'), 'passes'),
    { label: t('match.passAccuracy'), home: acc(h), away: acc(a) },
    row(t('match.crosses'), 'crosses'),
    row(t('match.corners'), 'corners'),
    row(t('match.fouls'), 'fouls'),
    row(t('match.offsides'), 'offsides'),
    row(t('match.distance'), 'distanceKm', 1, ' km'),
    row(t('match.pressures'), 'pressuresApplied'),
    row(t('match.turnovers'), 'forcedTurnovers'),
  ].filter((r) => r.home !== '–' || r.away !== '–')
})
// The open tab lives in the URL so a refresh (or a shared link) lands on it.
const activeTab = ref((route.query.tab as string) || 'stats')
// No stats (upcoming match) and no explicit choice: land on form instead.
watch([() => detailStatus.value, () => insightsStatus.value], () => {
  if (!route.query.tab && eventsReady.value && !hasStats.value && activeTab.value === 'stats') activeTab.value = 'form'
})
watch(activeTab, (tab) => {
  router.replace({ query: { ...route.query, tab: tab === 'stats' ? undefined : tab } })
})

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
          <div v-else class="text-sm flex flex-col items-center gap-1" style="color: var(--p-text-muted-color)">
            <span>{{ new Date(m.kickoffTime).toLocaleString() }}</span>
            <Countdown :to="m.kickoffTime" />
          </div>
          <div v-if="hadShootout" class="text-sm font-semibold mt-1" style="color: var(--p-text-muted-color)">{{ m.penaltiesHome }}–{{ m.penaltiesAway }} {{ t('match.pens') }}</div>
        </div>
        <div class="flex flex-col items-center gap-2 flex-1">
          <img v-if="flagUrl(m.awayTeamCode)" :src="flagUrl(m.awayTeamCode) || ''" class="w-16 h-16 rounded-lg object-cover" alt="" >
          <component :is="m.awayTeamCode ? NuxtLinkC : 'span'" :to="m.awayTeamCode ? `/${selectedSlug}/teams/${m.awayTeamCode}` : undefined" class="font-bold text-center hover:underline" :title="m.awayTeam">{{ m.awayTeam }}</component>
        </div>
      </div>

      <!-- One laced timeline: each event is a row, on its team's side - the whole
           match reads top-to-bottom at a glance. -->
      <div v-if="eventsReady && hasTimelineExtras" class="flex justify-end gap-2 mt-3 text-xs">
        <button type="button" class="px-2 py-0.5 rounded-full border transition-opacity" :class="showBookings ? '' : 'opacity-40'" style="border-color: var(--p-content-border-color); color: var(--p-text-muted-color)" :title="t('match.toggleBookings')" @click="showBookings = !showBookings">🟨 {{ t('match.bookings') }}</button>
        <button type="button" class="px-2 py-0.5 rounded-full border transition-opacity" :class="showSubs ? '' : 'opacity-40'" style="border-color: var(--p-content-border-color); color: var(--p-text-muted-color)" :title="t('match.toggleSubs')" @click="showSubs = !showSubs">🔄 {{ t('match.subs') }}</button>
      </div>
      <div v-if="eventsReady && timeline.length" class="grid grid-cols-[1fr_auto_1fr] gap-x-2 gap-y-0.5 mt-2 pt-3 border-t text-xs items-center" style="color: var(--p-text-muted-color); border-color: var(--p-content-border-color)">
        <template v-for="(e, i) in timeline" :key="i">
          <span class="inline-flex items-center gap-1 justify-end text-right">
            <template v-if="e.side === 'HOME'">
              <template v-if="e.kind === 'sub'"><span style="color: #22c55e">▲</span> {{ formatPlayerName(e.playerName) }} <span class="opacity-60">· {{ formatPlayerName(e.offName) }} <span style="color: #ef4444">▼</span></span> 🔄</template>
              <template v-else>
                {{ formatPlayerName(e.playerName) }}<span v-if="e.kind === 'goal' && e.ownGoal"> (OG)</span><span v-if="e.kind === 'card' && e.coach" :title="t('match.coachCard')"> 📋</span>
              </template>
              <template v-if="e.kind === 'goal'">⚽</template>
              <span v-else-if="e.card === 'SECOND_YELLOW'" class="relative inline-block w-3 h-3" title="Second yellow"><span class="absolute left-0 top-0 w-2 h-3 rounded-[2px]" style="background: #eab308" /><span class="absolute left-1 top-0 w-2 h-3 rounded-[2px]" style="background: #ef4444" /></span>
              <span v-else class="inline-block w-2 h-3 rounded-[2px]" :style="`background:${e.card === 'RED' ? '#ef4444' : '#eab308'}`" />
            </template>
          </span>
          <span class="tabular-nums text-center w-12 opacity-70">{{ e.minute }}</span>
          <span class="inline-flex items-center gap-1">
            <template v-if="e.side === 'AWAY'">
              <template v-if="e.kind === 'sub'">🔄 <span style="color: #22c55e">▲</span> {{ formatPlayerName(e.playerName) }} <span class="opacity-60">· {{ formatPlayerName(e.offName) }} <span style="color: #ef4444">▼</span></span></template>
              <template v-if="e.kind === 'goal'">⚽</template>
              <span v-else-if="e.kind === 'card' && e.card === 'SECOND_YELLOW'" class="relative inline-block w-3 h-3" title="Second yellow"><span class="absolute left-0 top-0 w-2 h-3 rounded-[2px]" style="background: #eab308" /><span class="absolute left-1 top-0 w-2 h-3 rounded-[2px]" style="background: #ef4444" /></span>
              <span v-else class="inline-block w-2 h-3 rounded-[2px]" :style="`background:${e.card === 'RED' ? '#ef4444' : '#eab308'}`" />
              {{ formatPlayerName(e.playerName) }}<span v-if="e.kind === 'goal' && e.ownGoal"> (OG)</span><span v-if="e.kind === 'card' && e.coach" :title="t('match.coachCard')"> 📋</span>
            </template>
          </span>
        </template>
      </div>
      <div v-else-if="!eventsReady" class="flex justify-center mt-4 pt-3 border-t" style="border-color: var(--p-content-border-color)">
        <ProgressSpinner style="width: 22px; height: 22px" stroke-width="6" />
      </div>

      <!-- your pick: editable until kickoff -->
      <div v-if="canPredict || myPred" class="flex flex-col items-center gap-1.5 mt-4 pt-3 border-t text-sm" style="border-color: var(--p-content-border-color)">
        <span class="text-xs font-semibold uppercase tracking-wider" style="color: var(--p-text-muted-color)">
          {{ t('match.yourPick') }}<span v-if="myPred?.isJoker" title="Joker" style="color: #f59e0b"> ★</span>
        </span>
        <ScoreInput v-if="canPredict" :home="myPred?.homeGoals ?? null" :away="myPred?.awayGoals ?? null" @update="savePrediction" />
        <template v-else-if="myPred">
          <span class="font-bold tabular-nums">{{ myPred.homeGoals }}–{{ myPred.awayGoals }}</span>
          <span v-if="myPred.totalPoints !== null" class="text-xs font-semibold" style="color: var(--p-primary-color)">+{{ myPred.totalPoints }} pts · {{ tierLabel(myPred.baseTier) }}</span>
        </template>
      </div>
    </div>

    <div v-if="insights" class="rounded-2xl border p-2 sm:p-4" style="background: var(--p-content-background); border-color: var(--p-content-border-color)">
      <Tabs v-model:value="activeTab">
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
            <div v-if="statRows.length" class="flex flex-col text-sm mb-4">
              <div v-for="r in statRows" :key="r.label" class="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-t py-1.5" style="border-color: var(--p-content-border-color)">
                <span class="text-right tabular-nums font-medium">{{ r.home }}</span>
                <span class="text-xs text-center min-w-32" style="color: var(--p-text-muted-color)">{{ r.label }}</span>
                <span class="tabular-nums font-medium">{{ r.away }}</span>
              </div>
            </div>
<!-- the chronological event list lives in the hero under both teams -->

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
                    <component :is="row.code ? NuxtLinkC : 'span'" :to="row.code ? `/${selectedSlug}/teams/${row.code}` : undefined" class="flex items-center gap-2" :class="{ 'hover:underline': row.code }">
                      <img v-if="flagUrl(row.code)" :src="flagUrl(row.code) || ''" class="w-5 h-5 rounded" alt="" >{{ row.name }}
                    </component>
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
                  <NuxtLink v-for="(f, i) in insights.form[side]" :key="i" :to="`/${selectedSlug}/matches/${f.matchId}`" class="flex items-center gap-2 text-sm hover:opacity-80">
                    <span class="w-5 h-5 rounded text-white text-xs flex items-center justify-center font-bold" :style="`background:${formColor(f.result)}`">{{ f.result }}</span>
                    <span style="color: var(--p-text-muted-color)">vs {{ f.opponent }}</span>
                    <span class="font-medium tabular-nums">{{ f.score }}</span>
                  </NuxtLink>
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
                  <NuxtLink v-for="(n, i) in insights.next[side]" :key="i" :to="`/${selectedSlug}/matches/${n.matchId}`" class="flex items-center gap-2 hover:opacity-80">
                    <span style="color: var(--p-text-muted-color)">{{ fmtDate(n.kickoffTime) }}</span>
                    <span style="color: var(--p-text-muted-color)">vs</span>
                    <img v-if="flagUrl(n.opponentCode)" :src="flagUrl(n.opponentCode) || ''" class="w-4 h-4 rounded" alt="" >{{ n.opponent }}
                  </NuxtLink>
                </div>
                <div v-else class="text-sm" style="color: var(--p-text-muted-color)">{{ t('match.noUpcoming') }}</div>
              </div>
            </div>
          </TabPanel>

          <TabPanel v-if="insights.headToHead.length" value="h2h">
            <div class="flex flex-col text-sm">
              <NuxtLink v-for="(h, i) in insights.headToHead" :key="i" :to="`/${selectedSlug}/matches/${h.matchId}`" class="flex items-center justify-between border-t py-2 hover:opacity-80" style="border-color: var(--p-content-border-color)">
                <span class="font-medium">{{ h.homeTeam }} {{ h.homeScore }}–{{ h.awayScore }}<template v-if="pensResult(h)"> ({{ pensResult(h) }} {{ t('match.pens') }})</template> {{ h.awayTeam }}</span>
                <span style="color: var(--p-text-muted-color)">{{ fmtDate(h.kickoffTime) }}</span>
              </NuxtLink>
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
                    {{ t('match.topScorer') }}: <b style="color: var(--p-text-color)">{{ formatPlayerName(bestBy(side, 'goals')?.playerName) || '-' }}</b><span v-if="bestBy(side, 'goals')"> ({{ bestBy(side, 'goals').goals }}⚽)</span>
                  </div>
                  <div style="color: var(--p-text-muted-color)">
                    {{ t('match.topAssister') }}: <b style="color: var(--p-text-color)">{{ formatPlayerName(bestBy(side, 'assists')?.playerName) || '-' }}</b><span v-if="bestBy(side, 'assists')"> ({{ bestBy(side, 'assists').assists }}👟)</span>
                  </div>
                  <div class="border-t mt-1 pt-2 flex flex-col gap-1" style="border-color: var(--p-content-border-color)">
                    <div v-for="(p, i) in teamPlayers(side)" :key="i" class="flex items-center justify-between gap-2">
                      <span class="truncate">{{ formatPlayerName(p.playerName) }}</span>
                      <span class="tabular-nums shrink-0" style="color: var(--p-text-muted-color)">{{ p.goals ?? 0 }}⚽ · {{ p.assists ?? 0 }}👟</span>
                    </div>
                  </div>
                </div>
                <div v-else class="text-sm" style="color: var(--p-text-muted-color)">-</div>
              </div>
            </div>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </div>
  </div>
  <div v-else class="opacity-60">Match not found.</div>
</template>
