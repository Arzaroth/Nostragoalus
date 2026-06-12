<script setup lang="ts">
import { buildTimeline, h2hSummaryOf } from '../../../utils/match-view'
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
  odds: { home: number; draw: number; away: number; fetchedAt: string } | null
  isLocked: boolean
}>(`/api/matches/${id.value}`)
// lazy: the page navigates immediately on the core match fetch; insight/stat
// sections fill in as their (slower, FIFA-backed) data lands.
const { data: insights, status: insightsStatus, clear: clearInsights, refresh: refreshInsights } = await useFetch<any>(`/api/matches/${id.value}/insights`, { lazy: true })

const selectedSlug = useSelectedCompetition()
const { data: scorersData, status: scorersStatus, clear: clearScorers } = await useFetch<{ scorers: any[] }>('/api/competitions/scorers', {
  query: computed(() => (selectedSlug.value ? { competition: selectedSlug.value } : {})),
  lazy: true,
})
const scorers = computed<any[]>(() => scorersData.value?.scorers ?? [])

const { data: detailData, status: detailStatus, clear: clearDetail, refresh: refreshDetail } = await useFetch<{ detail: any }>(`/api/matches/${id.value}/live-detail`, { lazy: true })
const detail = computed(() => detailData.value?.detail)

// The play-by-play is heavy (hundreds of events) and behind a tab - fetch it
// only once that tab is opened, then refresh it on the live poll.
const {
  data: timelineData,
  status: timelineStatus,
  clear: clearTimeline,
  refresh: refreshTimeline,
  execute: loadTimeline,
} = await useFetch<{ events: any[] }>(`/api/matches/${id.value}/timeline`, { lazy: true, immediate: false })
const playByPlay = computed<any[]>(() => timelineData.value?.events ?? [])

// These FIFA-backed fetches can run for seconds; leaving the page aborts them.
useCancelOnLeave(
  { status: insightsStatus, clear: clearInsights },
  { status: scorersStatus, clear: clearScorers },
  { status: detailStatus, clear: clearDetail },
  { status: timelineStatus, clear: clearTimeline },
)

const m = computed(() => data.value?.match)
useHead({ title: () => (m.value ? `${m.value.homeTeam} – ${m.value.awayTeam}` : t('nav.matches')) })
const { live } = useLiveMatch(id)
const { enabled: crowdEnabled, totals: crowdTotals, leagueTotals, leagueActive } = useCrowdTotals()
const oddsEnabled = useOddsPreference()

// A live score increase = somebody scored: run the pixel celebration.
const celebrating = ref(false)
let celebrationTimer: ReturnType<typeof setTimeout> | undefined
watch(live, (now, prev) => {
  const total = (u: any) => (u?.fullTimeHome ?? 0) + (u?.fullTimeAway ?? 0)
  const baseline = prev ?? { fullTimeHome: m.value?.fullTimeHome, fullTimeAway: m.value?.fullTimeAway }
  if (now && now.status !== 'FINISHED' && total(now) > total(baseline)) {
    celebrating.value = true
    clearTimeout(celebrationTimer)
    celebrationTimer = setTimeout(() => (celebrating.value = false), 3200)
    // The score moved - pull fresh goals/cards/stats right away.
    refreshInsights()
    refreshDetail()
  }
})
onBeforeUnmount(() => clearTimeout(celebrationTimer))

// Your pick, editable in place until kickoff.
const myPred = computed(() => data.value?.myPrediction ?? null)
const predLocked = computed(() => data.value?.isLocked ?? true)
const canPredict = computed(() => !predLocked.value && !!m.value?.homeTeamCode && !!m.value?.awayTeamCode)
const { upsert } = usePredictionMutations()
function savePrediction(v: { home: number; away: number }) {
  upsert.mutate({ matchId: id.value, home: v.home, away: v.away }, { onSuccess: () => refreshMatch() })
}

const status = computed(() => (live.value?.status ?? m.value?.status ?? 'SCHEDULED') as import('../../../../shared/types/match').MatchStatus)
const homeScore = computed(() => live.value?.fullTimeHome ?? m.value?.fullTimeHome ?? null)
const awayScore = computed(() => live.value?.fullTimeAway ?? m.value?.fullTimeAway ?? null)
const isLive = computed(() => status.value === 'LIVE' || status.value === 'PAUSED')
// Live clock under the score: half-time, the provider's running minute (e.g.
// "47'"), or a bare LIVE when the minute isn't exposed.
const liveClock = computed(() =>
  status.value === 'PAUSED' || detail.value?.halfTime ? t('match.halfTime') : detail.value?.minute || t('match.live'),
)
// Possession bar: FIFA's BallPossession is null mid-match, but the live IFES
// stats carry it - fall back to those so the bar shows during the game too.
const possession = computed(() => {
  const ins = insights.value?.possession
  if (ins?.home != null && ins?.away != null) return { home: ins.home, away: ins.away }
  const h = detail.value?.stats?.home?.possession
  const a = detail.value?.stats?.away?.possession
  return h != null && a != null ? { home: h, away: a } : null
})
// Per-team possession is "clean" possession; the rest is contested (FIFA shows
// it as a middle "in contest" segment), so the two sides don't sum to 100.
const possessionContest = computed(() =>
  possession.value ? Math.max(0, Math.round(100 - possession.value.home - possession.value.away)) : 0,
)

// While the match is live, the score patches over WS but the stats and event
// timeline (FIFA-backed) don't - poll them so they keep up.
let liveStatsTimer: ReturnType<typeof setInterval> | undefined
watch(
  isLive,
  (on) => {
    clearInterval(liveStatsTimer)
    if (on && import.meta.client)
      liveStatsTimer = setInterval(() => {
        refreshInsights()
        refreshDetail()
        // Only keep the play-by-play warm once it has been opened.
        if (timelineStatus.value !== 'idle') refreshTimeline()
      }, 45_000)
  },
  { immediate: true },
)
onBeforeUnmount(() => clearInterval(liveStatsTimer))

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
// Prefer the live FIFA detail goals (present during the match) over the DB
// goal_event view (only synced at finalize, so empty for a live game).
const goals = computed<any[]>(() => (detail.value?.goals ?? insights.value?.goals ?? []) as any[])
const homeGoalEvents = computed(() => goals.value.filter((g: any) => g.side === 'HOME'))
const awayGoalEvents = computed(() => goals.value.filter((g: any) => g.side === 'AWAY'))
const hasStats = computed(
  () => homeGoalEvents.value.length > 0 || awayGoalEvents.value.length > 0 || insights.value?.possession?.home != null || !!detail.value,
)
const hadShootout = computed(() => ((m.value?.penaltiesHome ?? 0) + (m.value?.penaltiesAway ?? 0)) > 0)
// The play-by-play tab is offered once the match is under way (the feed is empty
// before kickoff); on finished matches it stays for the full record.
const hasStarted = computed(() => isLive.value || status.value === 'FINISHED')

// Emoji per play-by-play event kind; goals/own-goals/penalties read as the loud
// moments, the rest are quieter markers.
const TIMELINE_ICONS: Record<string, string> = {
  goal: '⚽',
  'own-goal': '⚽',
  'penalty-goal': '⚽',
  'penalty-missed': '❌',
  'penalty-awarded': '🎯',
  assist: '👟',
  yellow: '🟨',
  red: '🟥',
  'second-yellow': '🟥',
  sub: '🔄',
  shot: '🥅',
  var: '📺',
  period: '⏱️',
}
const GOAL_KINDS = new Set(['goal', 'own-goal', 'penalty-goal'])

function cardEvents(side: 'HOME' | 'AWAY') {
  return (detail.value?.bookings ?? []).filter((b: any) => b.side === side)
}
// Goals arrive with insights, cards with the live detail - show the timeline only
// once both have settled so events don't pop in piecemeal. A live-refresh keeps
// the previous data while re-fetching, so stay "ready" then and patch the
// timeline in place instead of collapsing back to the spinner.
const eventsReady = computed(
  () => (insightsStatus.value !== 'pending' || !!insights.value) && (detailStatus.value !== 'pending' || !!detail.value),
)
// Goals + bookings interleaved chronologically.
// Timeline visibility toggles, remembered across visits.
const showBookings = useLocalStorage('ng-timeline-bookings', true)
const showSubs = useLocalStorage('ng-timeline-subs', true)

const timeline = computed(() =>
  buildTimeline({
    goals: goals.value,
    bookings: detail.value?.bookings ?? [],
    substitutions: detail.value?.substitutions ?? [],
    homeCode: m.value?.homeTeamCode,
    awayCode: m.value?.awayTeamCode,
    showBookings: showBookings.value,
    showSubs: showSubs.value,
  }),
)
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
// With no explicit tab, a live match opens straight on the play-by-play; any
// other state defaults to stats.
const activeTab = ref((route.query.tab as string) || (isLive.value ? 'timeline' : 'stats'))
// No stats (upcoming match) and no explicit choice: land on form instead.
watch([() => detailStatus.value, () => insightsStatus.value], () => {
  if (!route.query.tab && eventsReady.value && !hasStats.value && activeTab.value === 'stats') activeTab.value = 'form'
})
watch(activeTab, (tab) => {
  router.replace({ query: { ...route.query, tab: tab === 'stats' ? undefined : tab } })
})
// Lazy-load the play-by-play the first time its tab is opened (immediate covers
// a direct landing on ?tab=timeline).
watch(activeTab, (tab) => { if (tab === 'timeline' && timelineStatus.value === 'idle') loadTimeline() }, { immediate: true })

// All-time head-to-head (FIFA's full calendar: friendlies, qualifiers,
// championships) from the home side's perspective; our own data as fallback.
const h2hSummary = computed(() => h2hSummaryOf(insights.value?.h2hAll, insights.value?.headToHead, m.value?.homeTeam))
const h2hTotal = computed(() => h2hSummary.value.homeWins + h2hSummary.value.draws + h2hSummary.value.awayWins)

// Meeting list: the all-time calendar, linked to our match pages when we hold
// that fixture (matched by day + the two team codes).
const h2hRows = computed(() => {
  const ours = insights.value?.headToHead ?? []
  const all = insights.value?.h2hAll?.meetings
  if (!all?.length) {
    return ours.map((h: any) => ({ ...h, competition: h.competitionName, link: `/${h.competitionSlug}/matches/${h.matchId}` }))
  }
  return all.map((meeting: any) => {
    const local = ours.find(
      (h: any) =>
        h.kickoffTime.slice(0, 10) === meeting.date.slice(0, 10) &&
        ((h.homeTeam === meeting.homeTeam && h.awayTeam === meeting.awayTeam) || (h.homeTeam === meeting.awayTeam && h.awayTeam === meeting.homeTeam)),
    )
    return {
      ...meeting,
      kickoffTime: meeting.date,
      penaltiesHome: local?.penaltiesHome ?? null,
      penaltiesAway: local?.penaltiesAway ?? null,
      link: local ? `/${local.competitionSlug}/matches/${local.matchId}` : null,
    }
  })
})

function formColor(r: string) {
  return r === 'W' ? 'var(--ng-success)' : r === 'L' ? 'var(--ng-danger)' : '#a1a1aa'
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
}

// Narrow form rows hide the competition behind the date; one open at a time.
const openFormInfo = ref<string | null>(null)
function toggleFormInfo(side: string, i: number | string) {
  const k = `${side}-${i}`
  openFormInfo.value = openFormInfo.value === k ? null : k
}
</script>

<template>
  <div>
  <Teleport to="body">
    <Transition name="goal-pop">
      <div v-if="celebrating" class="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4" style="background: rgba(10, 8, 24, 0.82)" @click="celebrating = false">
        <GoalAnimation />
        <div class="text-3xl font-black tracking-widest" style="color: #cdbfff">{{ t('match.goal') }}</div>
        <div class="text-sm" style="color: var(--p-text-muted-color)">{{ m?.homeTeam }} {{ homeScore }}–{{ awayScore }} {{ m?.awayTeam }}</div>
      </div>
    </Transition>
  </Teleport>
  <div v-if="m" class="flex flex-col gap-6">
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <NuxtLink :to="`/${selectedSlug}/matches`" class="text-sm inline-flex items-center gap-1" style="color: var(--p-text-muted-color)">
        <i class="pi pi-arrow-left" /> {{ t('common.back') }}
      </NuxtLink>
      <!-- Scopes the crowd line below (and the league crowd patches). -->
      <LeaguePill v-if="crowdEnabled" />
    </div>

    <div class="rounded-2xl border p-6" style="background: var(--p-content-background); border-color: var(--p-content-border-color)">
      <div class="flex items-center justify-between text-xs mb-4" style="color: var(--p-text-muted-color)">
        <span>{{ m.roundLabel }}<template v-if="m.group"> · Group {{ m.group }}</template></span>
        <Tag :value="matchStatusLabel(status)" :severity="statusSeverity(status)" />
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
          <!-- live indicator + clock, under the score -->
          <div v-if="isLive" class="flex items-center justify-center gap-1.5 mt-1.5 text-sm font-semibold tabular-nums" style="color: var(--ng-danger)">
            <span class="w-2 h-2 rounded-full animate-pulse" style="background: var(--ng-danger)" />{{ liveClock }}
          </div>
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
      <!-- name | icon | minute | icon | name: the icons live in their own rail
           next to the minute, so they stay aligned even when a name wraps.
           Substitutions are two lines: player on above player off, arrows first. -->
      <div v-if="eventsReady && timeline.length" class="grid grid-cols-[1fr_auto_auto_auto_1fr] gap-x-1.5 gap-y-1 mt-2 pt-3 border-t text-xs items-center" style="color: var(--p-text-muted-color); border-color: var(--p-content-border-color)">
        <template v-for="(e, i) in timeline" :key="i">
          <span class="min-w-0 text-right">
            <template v-if="e.side === 'HOME'">
              <span v-if="e.kind === 'sub'" class="flex flex-col items-end">
                <span><span style="color: var(--ng-success)">▲</span> {{ formatPlayerName(e.playerName) }}</span>
                <span class="opacity-60"><span style="color: var(--ng-danger)">▼</span> {{ formatPlayerName(e.offName) }}</span>
              </span>
              <template v-else>{{ formatPlayerName(e.playerName) }}<span v-if="e.kind === 'goal' && e.ownGoal"> (OG)</span><span v-if="e.kind === 'card' && e.coach" :title="t('match.coachCard')"> 📋</span></template>
            </template>
          </span>
          <span class="w-4 flex justify-center">
            <template v-if="e.side === 'HOME'">
              <template v-if="e.kind === 'goal'">⚽</template>
              <template v-else-if="e.kind === 'sub'">🔄</template>
              <span v-else-if="e.card === 'SECOND_YELLOW'" class="relative inline-block w-3 h-3" title="Second yellow"><span class="absolute left-0 top-0 w-2 h-3 rounded-[2px]" style="background: #eab308" /><span class="absolute left-1 top-0 w-2 h-3 rounded-[2px]" style="background: var(--ng-danger)" /></span>
              <span v-else class="inline-block w-2 h-3 rounded-[2px]" :style="`background:${e.card === 'RED' ? 'var(--ng-danger)' : '#eab308'}`" />
            </template>
          </span>
          <span class="tabular-nums text-center w-12 opacity-70">{{ e.minute }}</span>
          <span class="w-4 flex justify-center">
            <template v-if="e.side === 'AWAY'">
              <template v-if="e.kind === 'goal'">⚽</template>
              <template v-else-if="e.kind === 'sub'">🔄</template>
              <span v-else-if="e.card === 'SECOND_YELLOW'" class="relative inline-block w-3 h-3" title="Second yellow"><span class="absolute left-0 top-0 w-2 h-3 rounded-[2px]" style="background: #eab308" /><span class="absolute left-1 top-0 w-2 h-3 rounded-[2px]" style="background: var(--ng-danger)" /></span>
              <span v-else class="inline-block w-2 h-3 rounded-[2px]" :style="`background:${e.card === 'RED' ? 'var(--ng-danger)' : '#eab308'}`" />
            </template>
          </span>
          <span class="min-w-0">
            <template v-if="e.side === 'AWAY'">
              <span v-if="e.kind === 'sub'" class="flex flex-col items-start">
                <span><span style="color: var(--ng-success)">▲</span> {{ formatPlayerName(e.playerName) }}</span>
                <span class="opacity-60"><span style="color: var(--ng-danger)">▼</span> {{ formatPlayerName(e.offName) }}</span>
              </span>
              <template v-else>{{ formatPlayerName(e.playerName) }}<span v-if="e.kind === 'goal' && e.ownGoal"> (OG)</span><span v-if="e.kind === 'card' && e.coach" :title="t('match.coachCard')"> 📋</span></template>
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
          {{ t('match.yourPick') }}<span v-if="myPred?.isJoker" title="Joker" style="color: var(--ng-star)"> ★</span>
        </span>
        <ScoreInput v-if="canPredict" :home="myPred?.homeGoals ?? null" :away="myPred?.awayGoals ?? null" @update="savePrediction" />
        <!-- Independent lines: the locked pick + points must never depend on the
             crowd/odds display preferences (a v-else-if chain here once hid them). -->
        <template v-if="!canPredict && myPred">
          <span class="font-bold tabular-nums">{{ myPred.homeGoals }}–{{ myPred.awayGoals }}</span>
          <span v-if="myPred.totalPoints !== null" class="text-xs font-semibold" style="color: var(--p-primary-color)">+{{ myPred.totalPoints }} pts · {{ tierLabel(myPred.baseTier) }}</span>
        </template>
        <CrowdLine v-if="crowdEnabled" :match-id="id" :totals="crowdTotals" :league-totals="leagueTotals" :league-active="leagueActive" count />
        <MatchOdds v-if="oddsEnabled" :odds="data?.odds ?? null" />
      </div>
    </div>

    <div v-if="insights" class="rounded-2xl border p-2 sm:p-4" style="background: var(--p-content-background); border-color: var(--p-content-border-color)">
      <Tabs v-model:value="activeTab">
        <TabList>
          <Tab v-if="hasStarted" value="timeline">{{ t('match.playByPlay') }}</Tab>
          <Tab v-if="hasStats || detailStatus === 'pending'" value="stats">{{ t('match.stats') }}</Tab>
          <Tab v-if="insights.standings" value="standings">{{ t('match.standings') }}</Tab>
          <Tab value="form">{{ t('match.form') }}</Tab>
          <Tab value="next">{{ t('match.next') }}</Tab>
          <Tab value="h2h">{{ t('match.h2h') }}</Tab>
          <Tab v-if="scorers.length" value="scorers">{{ t('match.players') }}</Tab>
        </TabList>
        <TabPanels>
          <TabPanel v-if="hasStats || detailStatus === 'pending'" value="stats">
            <!-- venue-line skeleton while the upstream-backed detail loads -->
            <div v-if="detailStatus === 'pending' && !detail" class="flex justify-center gap-4 mb-4">
              <Skeleton width="8rem" height="1rem" />
              <Skeleton width="5rem" height="1rem" />
            </div>
            <div v-if="detail" class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs mb-4" style="color: var(--p-text-muted-color)">
              <span v-if="detail.stadium" class="inline-flex items-center gap-1"><i class="pi pi-map-marker" /> {{ detail.stadium }}</span>
              <span v-if="detail.attendance" class="inline-flex items-center gap-1"><i class="pi pi-users" /> {{ detail.attendance.toLocaleString() }}</span>
              <span class="inline-flex items-center gap-1"><span class="inline-block w-2.5 h-3.5 rounded-sm" style="background: #eab308" />{{ detail.cards.home.yellow }}–{{ detail.cards.away.yellow }}</span>
              <span v-if="detail.cards.home.red || detail.cards.away.red" class="inline-flex items-center gap-1"><span class="inline-block w-2.5 h-3.5 rounded-sm" style="background: var(--ng-danger)" />{{ detail.cards.home.red }}–{{ detail.cards.away.red }}</span>
            </div>
            <div v-if="possession" class="mb-4">
              <div class="flex justify-between text-xs mb-1" style="color: var(--p-text-muted-color)">
                <span>{{ Math.round(possession.home) }}%</span>
                <span>{{ t('match.possession') }}<template v-if="possessionContest > 0"> · {{ possessionContest }}% {{ t('match.inContest') }}</template></span>
                <span>{{ Math.round(possession.away) }}%</span>
              </div>
              <div class="flex h-2 rounded overflow-hidden">
                <div :style="`width:${possession.home}%; background: var(--p-primary-color)`" />
                <div v-if="possessionContest > 0" :style="`width:${possessionContest}%; background: var(--ng-star)`" />
                <div :style="`width:${possession.away}%; background: var(--p-content-border-color)`" />
              </div>
            </div>
            <!-- stat rows skeleton below the (already-loaded) possession bar -->
            <div v-if="detailStatus === 'pending' && !detail" class="flex flex-col gap-2">
              <div v-for="i in 8" :key="i" class="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <Skeleton width="2.5rem" height="0.9rem" class="justify-self-end" />
                <Skeleton :width="`${5 + (i % 3)}rem`" height="0.9rem" class="justify-self-center" />
                <Skeleton width="2.5rem" height="0.9rem" />
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
                  <td class="py-2 text-left">{{ Number(i) + 1 }}</td>
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
                <!-- All international results before this match, not just our competitions. -->
                <div v-if="insights.formAll?.[side]?.length" class="flex flex-col gap-1.5">
                  <template v-for="(f, i) in insights.formAll[side]" :key="i">
                    <div class="flex items-center gap-2 text-sm">
                      <span class="w-5 h-5 rounded text-white text-xs flex items-center justify-center font-bold shrink-0" :style="`background:${formColor(f.result)}`">{{ f.result }}</span>
                      <span class="truncate" style="color: var(--p-text-muted-color)">vs {{ f.opponent }}</span>
                      <span class="font-medium tabular-nums whitespace-nowrap shrink-0">{{ f.score }}</span>
                      <!-- Narrow screens: only the date fits; the dotted underline hints
                           that tapping it reveals the competition. -->
                      <button
                        type="button"
                        class="text-xs ml-auto text-right shrink-0 whitespace-nowrap sm:hidden underline decoration-dotted underline-offset-2"
                        style="color: var(--p-text-muted-color)"
                        :title="f.competition"
                        @click="toggleFormInfo(side, i)"
                      >{{ fmtDate(f.date) }}</button>
                      <span class="text-xs ml-auto text-right shrink-0 hidden sm:inline" style="color: var(--p-text-muted-color)">{{ f.competition }} · {{ fmtDate(f.date) }}</span>
                    </div>
                    <div v-if="openFormInfo === `${side}-${i}`" class="sm:hidden text-xs pl-7 -mt-1" style="color: var(--p-text-muted-color)">{{ f.competition }}</div>
                  </template>
                </div>
                <div v-else-if="insights.form[side].length" class="flex flex-col gap-1.5">
                  <NuxtLink v-for="(f, i) in insights.form[side]" :key="i" :to="`/${selectedSlug}/matches/${f.matchId}`" class="flex items-center gap-2 text-sm hover:opacity-80">
                    <span class="w-5 h-5 rounded text-white text-xs flex items-center justify-center font-bold" :style="`background:${formColor(f.result)}`">{{ f.result }}</span>
                    <span class="truncate" style="color: var(--p-text-muted-color)">vs {{ f.opponent }}</span>
                    <span class="font-medium tabular-nums whitespace-nowrap shrink-0">{{ f.score }}</span>
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
                    <!-- Played since (browsing history): same look as the Form tab. -->
                    <span v-if="n.result" class="w-5 h-5 rounded text-white text-xs flex items-center justify-center font-bold shrink-0" :style="`background:${formColor(n.result)}`">{{ n.result }}</span>
                    <span v-else class="shrink-0" style="color: var(--p-text-muted-color)">{{ fmtDate(n.kickoffTime) }}</span>
                    <span style="color: var(--p-text-muted-color)">vs</span>
                    <img v-if="flagUrl(n.opponentCode)" :src="flagUrl(n.opponentCode) || ''" class="w-4 h-4 rounded" alt="" >
                    <span class="truncate">{{ n.opponent }}</span>
                    <span v-if="n.score" class="font-medium tabular-nums">{{ n.score }}</span>
                    <span v-if="n.result" class="text-xs ml-auto shrink-0" style="color: var(--p-text-muted-color)">{{ fmtDate(n.kickoffTime) }}</span>
                  </NuxtLink>
                </div>
                <div v-else class="text-sm" style="color: var(--p-text-muted-color)">{{ t('match.noUpcoming') }}</div>
              </div>
            </div>
          </TabPanel>

          <TabPanel value="h2h">
            <div v-if="!h2hRows.length" class="text-sm text-center py-4" style="color: var(--p-text-muted-color)">{{ t('match.h2hNone') }}</div>
            <template v-else>
            <div v-if="h2hTotal" class="mb-4">
              <div class="flex justify-between text-xs mb-1" style="color: var(--p-text-muted-color)">
                <span><b style="color: var(--p-text-color)">{{ h2hSummary.homeWins }}</b> {{ m.homeTeam }}</span>
                <span>{{ h2hSummary.draws }} {{ t('match.draws') }}</span>
                <span>{{ m.awayTeam }} <b style="color: var(--p-text-color)">{{ h2hSummary.awayWins }}</b></span>
              </div>
              <div class="flex h-2 rounded-full overflow-hidden gap-px">
                <div :style="`width:${(h2hSummary.homeWins / h2hTotal) * 100}%; background: var(--p-primary-color)`" />
                <div :style="`width:${(h2hSummary.draws / h2hTotal) * 100}%; background: var(--p-content-border-color)`" />
                <div :style="`width:${(h2hSummary.awayWins / h2hTotal) * 100}%; background: #71717a`" />
              </div>
              <div class="text-center text-xs mt-1" style="color: var(--p-text-muted-color)">{{ h2hSummary.goalsFor }}–{{ h2hSummary.goalsAgainst }} {{ t('team.goals').toLowerCase() }}</div>
            </div>
            <div class="flex flex-col text-sm">
              <component :is="h.link ? NuxtLinkC : 'div'" v-for="(h, i) in h2hRows" :key="i" :to="h.link ?? undefined" class="flex items-center justify-between gap-3 border-t py-2" :class="h.link ? 'hover:opacity-80' : ''" style="border-color: var(--p-content-border-color)">
                <span class="font-medium truncate">{{ h.homeTeam }} {{ h.homeScore }}–{{ h.awayScore }}<template v-if="pensResult(h)"> ({{ pensResult(h) }} {{ t('match.pens') }})</template> {{ h.awayTeam }}</span>
                <span class="text-xs shrink-0" style="color: var(--p-text-muted-color)">{{ h.competition }} · {{ fmtDate(h.kickoffTime) }}</span>
              </component>
            </div>
            </template>
          </TabPanel>

          <TabPanel v-if="hasStarted" value="timeline">
            <!-- skeleton on the first open; a live refresh keeps the list in place -->
            <div v-if="timelineStatus === 'pending' && !playByPlay.length" class="flex flex-col gap-2">
              <div v-for="i in 8" :key="i" class="flex items-center gap-3 py-1">
                <Skeleton width="2rem" height="0.9rem" />
                <Skeleton width="1.25rem" height="1.25rem" shape="circle" />
                <Skeleton :width="`${8 + (i % 4) * 2}rem`" height="0.9rem" />
              </div>
            </div>
            <div v-else-if="!playByPlay.length" class="text-sm text-center py-4" style="color: var(--p-text-muted-color)">{{ t('match.playByPlayEmpty') }}</div>
            <div v-else class="flex flex-col">
              <div
                v-for="(e, i) in playByPlay"
                :key="i"
                class="grid grid-cols-[2.25rem_1.5rem_1fr_auto] items-baseline gap-2 border-t py-2 pl-2"
                :class="GOAL_KINDS.has(e.kind) ? 'font-semibold' : ''"
                :style="`border-left: 2px solid ${e.side === 'HOME' ? 'var(--p-primary-color)' : e.side === 'AWAY' ? '#71717a' : 'transparent'}; border-top-color: var(--p-content-border-color)`"
              >
                <span class="tabular-nums text-xs text-right" style="color: var(--p-text-muted-color)">{{ e.minute }}</span>
                <span class="text-center leading-none">{{ TIMELINE_ICONS[e.kind] || '•' }}</span>
                <span :style="e.side ? '' : 'color: var(--p-text-muted-color)'">{{ e.text }}</span>
                <span v-if="GOAL_KINDS.has(e.kind) && e.homeScore != null" class="tabular-nums text-xs px-1.5 py-0.5 rounded" style="background: var(--p-content-border-color)">{{ e.homeScore }}–{{ e.awayScore }}</span>
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
  </div>
</template>
