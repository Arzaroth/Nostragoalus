<script setup lang="ts">
import { useHotkey } from '@tanstack/vue-hotkeys'
const { t, locale } = useI18n()
useHead({ title: t('nav.matches') })
const { enabled: crowdEnabled, totals: crowdTotals, leagueTotals, leagueActive } = useCrowdTotals()
const oddsEnabled = useOddsPreference()
const slug = useSelectedCompetition()
const { data: matches, isLoading } = useMatches()

// Status filter buckets: all on by default, untick to hide. ?status=live
// (comma list) pre-selects, e.g. the home CTA's "N matches in play" link.
const route = useRoute()
// Chip order is a past->future timeline, mirroring the page (oldest first).
const STATUS_BUCKETS = {
  fulltime: ['FINISHED', 'AWARDED'],
  live: ['LIVE', 'PAUSED', 'SUSPENDED'],
  upcoming: ['SCHEDULED', 'POSTPONED', 'CANCELLED'],
} as const
type StatusBucket = keyof typeof STATUS_BUCKETS
const ALL_BUCKETS = Object.keys(STATUS_BUCKETS) as StatusBucket[]
// Parse the (deduped) ?status= comma list; unknown buckets are dropped.
const parseBuckets = (v: unknown): StatusBucket[] => [
  ...new Set(
    String(v ?? '')
      .split(',')
      .filter((b): b is StatusBucket => ALL_BUCKETS.includes(b as StatusBucket)),
  ),
]
const fromQuery = parseBuckets(route.query.status)
const activeBuckets = ref<StatusBucket[]>(fromQuery.length ? fromQuery : [...ALL_BUCKETS])
// A query-only navigation (e.g. the home CTA's ?status=live link while the page
// is already open) doesn't remount, so re-apply the filter when it changes.
watch(
  () => route.query.status,
  (v) => {
    const parsed = parseBuckets(v)
    if (parsed.length) activeBuckets.value = parsed
  },
)
const bucketOf = (s: string): StatusBucket =>
  ALL_BUCKETS.find((b) => (STATUS_BUCKETS[b] as readonly string[]).includes(s)) ?? 'upcoming'
function toggleBucket(b: StatusBucket) {
  if (activeBuckets.value.includes(b)) {
    // An empty filter renders "no matches found", which reads as a bug, not
    // a choice - the last active bucket refuses to untick (same allow-empty:
    // false convention as the SelectButtons).
    if (activeBuckets.value.length === 1) return
    activeBuckets.value = activeBuckets.value.filter((x) => x !== b)
  } else {
    activeBuckets.value = [...activeBuckets.value, b]
  }
}

// View switch (Fixtures | Standings) in the filter row. Group tables come from
// the competition's group-stage matches; the switch only shows when there are
// groups, so a knockout-only tournament never offers an empty Standings view.
const router = useRouter()
const viewMode = ref<'fixtures' | 'standings'>(route.query.view === 'standings' ? 'standings' : 'fixtures')
// Toggle visibility comes from the fixtures we already loaded - no extra request
// just to decide whether to offer the view. The tables themselves load lazily,
// only once Standings is actually open.
const hasGroups = computed(() => (matches.value ?? []).some((m) => !!m.group))
const { data: standings } = useStandings(() => viewMode.value === 'standings')
const viewOptions = computed(() => [
  { label: t('matches.viewFixtures'), value: 'fixtures' as const },
  { label: t('matches.viewStandings'), value: 'standings' as const },
])
// Mirror the mode in the URL (shareable), dropping it for the default.
watch(viewMode, (v) => router.replace({ query: { ...route.query, view: v === 'standings' ? 'standings' : undefined } }))
// A competition with no group stage can't stay on Standings (e.g. switching to a
// knockout-only tournament while the view is open).
watch(hasGroups, (has) => {
  if (!has && viewMode.value === 'standings') viewMode.value = 'fixtures'
})

const { data: predictions } = useMyPredictions()
const { upsert, setJoker } = usePredictionMutations()

// Defer the fixtures list until the champion/best-scorer pick cards above it
// resolve: on mobile they grow from skeleton to full height once their queries
// land, and if the list (and its first auto-scroll) renders before that, the
// growth pushes the scroll target back below the fold. The cards still mount and
// fetch immediately - only the list waits. Shares the cache with the cards' own
// useChampion/useBestScorer, so it adds an observer, not a request. isPending
// (not isLoading) so an errored pick query still releases the list.
const { query: championQuery } = useChampion()
const { query: bestScorerQuery } = useBestScorer()
const picksReady = computed(() => !championQuery.isPending.value && !bestScorerQuery.isPending.value)

// Your standing (folded in from the removed My Picks page). Honors the league
// pill: with a league selected, rank/players are within that league.
const { leagueId } = useSelectedLeague()
const { data: statsData, refresh: refreshStats } = await useFetch<{ stats: { rank: number | null; players: number; totalPoints: number; exact: number; predictions: number; jokers: number } | null }>(
  '/api/me/stats',
  { query: computed(() => (leagueId.value ? { league: leagueId.value } : slug.value ? { competition: slug.value } : {})) },
)
const stats = computed(() => statsData.value?.stats)
// Patch the list live, and on a score change refresh the points/stats that the
// patcher can't derive (full-time points, your rank).
useLiveMatches(matches, () => refreshStats())

const predByMatch = computed(() => {
  const map: Record<string, MyPrediction> = {}
  for (const p of predictions.value ?? []) map[p.matchId] = p
  return map
})

// Rounds whose one joker already sits on a locked (started/finished) match: it
// can't be moved, so every other match in that round can't take the joker. We
// disable those buttons rather than let the click fail server-side.
const lockedById = computed(() => {
  const map: Record<string, boolean> = {}
  for (const m of matches.value ?? []) map[m.id] = m.isLocked
  return map
})
const lockedJokerRounds = computed(() => {
  const set = new Set<string>()
  for (const p of predictions.value ?? []) {
    if (p.isJoker && lockedById.value[p.matchId]) set.add(p.roundId)
  }
  return set
})
// True when this match can't take/drop the joker because the round's joker is
// locked elsewhere (the match's own locked joker is already handled by m.isLocked).
function jokerRoundLocked(m: MatchListItem): boolean {
  return lockedJokerRounds.value.has(m.roundId) && !predByMatch.value[m.id]?.isJoker
}

// Country multiselect: keep matches involving any selected team. Options are the
// distinct teams in the fixtures; the picker filters fuzzily (the folded `search`
// field makes the typeahead case/diacritic-insensitive).
const selectedCountries = ref<string[]>([])
// Scope the filter to the selected competition: a country picked in one shouldn't
// linger when you switch to another.
watch(slug, () => { selectedCountries.value = [] })
const teamOptions = computed(() => {
  const byCode = new Map<string, { code: string; name: string; search: string }>()
  for (const m of matches.value ?? []) {
    if (m.homeTeamCode && !byCode.has(m.homeTeamCode)) byCode.set(m.homeTeamCode, { code: m.homeTeamCode, name: m.homeTeam, search: searchable(m.homeTeam) })
    if (m.awayTeamCode && !byCode.has(m.awayTeamCode)) byCode.set(m.awayTeamCode, { code: m.awayTeamCode, name: m.awayTeam, search: searchable(m.awayTeam) })
  }
  return [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name))
})
const grouped = computed(() => {
  const picked = selectedCountries.value
  const groups = new Map<string, { id: string; label: string; sort: number; items: MatchListItem[] }>()
  for (const m of matches.value ?? []) {
    if (!activeBuckets.value.includes(bucketOf(m.status))) continue
    if (picked.length && !picked.includes(m.homeTeamCode ?? '') && !picked.includes(m.awayTeamCode ?? '')) continue
    const g = groups.get(m.roundId) ?? { id: m.roundId, label: m.roundLabel, sort: m.roundSortOrder, items: [] }
    g.items.push(m)
    groups.set(m.roundId, g)
  }
  return [...groups.values()].sort((a, b) => a.sort - b.sort)
})

// Rounds collapse independently (matchday 1, R16, ...); all open by default.
const collapsedRounds = ref<Set<string>>(new Set())
function toggleRound(id: string) {
  const next = new Set(collapsedRounds.value)
  next.has(id) ? next.delete(id) : next.add(id)
  collapsedRounds.value = next
}

// Hash anchors (e.g. the home page's next-match CTA) point at rows that only
// exist once the query resolves AND the page is mounted - the router's own
// hash scroll fires before either. Retry whenever the rendered list or mount
// state changes, until the target exists. scrollIntoView honors the rows'
// scroll-margin-top, unlike the router's hash scroll.
const pageMounted = useMounted()
// Track the last hash we scrolled to (not a bare flag) so a query-only/hash
// navigation while the page is already open re-scrolls to the new target.
let scrolledHash = ''
watch(
  [grouped, pageMounted, () => route.hash],
  async () => {
    const target = route.hash.startsWith('#match-') ? route.hash.slice(1) : null
    if (!target || route.hash === scrolledHash || !pageMounted.value) return
    await nextTick()
    const el = document.getElementById(target)
    if (!el) return
    scrolledHash = route.hash
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  },
  { immediate: true, flush: 'post' },
)

// On md+ the match list owns its own scroll region so the header/stats/picks/
// filters stay put. On mobile the content above already exceeds the viewport, so
// the page scrolls normally instead (no region, no lock).
const isWide = useMediaQuery('(min-width: 768px)')
const listEl = ref<HTMLElement | null>(null)
const listMaxH = ref<string | undefined>(undefined)
// The list only becomes its own scroll region when it's wide AND there's enough
// room left below the stuff above it. On mobile, or when the stats/picks already
// fill the viewport (short/landscape tablets), the page scrolls normally.
const contained = ref(false)
const MIN_REGION = 360
function updateListHeight() {
  const c = listEl.value
  if (!isWide.value || !c) {
    contained.value = false
    listMaxH.value = undefined
    return
  }
  const top = c.getBoundingClientRect().top
  const footerH = document.querySelector('footer')?.getBoundingClientRect().height ?? 0
  // Reserve the footer (and main's pb-6) below the list so the page doesn't grow
  // past the viewport and sprout a second scrollbar.
  const avail = Math.floor(window.innerHeight - top - footerH - 24)
  if (avail < MIN_REGION) {
    contained.value = false
    listMaxH.value = undefined
    return
  }
  contained.value = true
  listMaxH.value = `${avail}px`
}
onMounted(() => useEventListener(window, 'resize', updateListHeight))
// The pick cards above the list grow from skeleton to full size after their
// queries resolve, which shifts the list's top edge - remeasure when they do.
const picksEl = ref<HTMLElement | null>(null)
useResizeObserver(picksEl, updateListHeight)
// vue-query resolves after mount on a hard reload, so the list isn't in the DOM
// at onMounted - (re)compute once it appears and on every relayout.
// viewMode + standings in the deps so the Standings view (which reuses listEl
// and the same contained-scroll region) remeasures when you switch to it and
// once its group tables land.
watch([isLoading, grouped, pageMounted, isWide, picksReady, viewMode, standings], () => nextTick(updateListHeight), { immediate: true, flush: 'post' })

// On first load, bring the action into view inside the list: the first live
// match, or failing that the next upcoming one. A hash anchor (home CTA) wins.
let didAutoScroll = false
function autoScrollTargetId(): string | null {
  const flat = grouped.value.flatMap((g) => g.items)
  const live = flat.find((m) => (STATUS_BUCKETS.live as readonly string[]).includes(m.status))
  if (live) return live.id
  const now = Date.now()
  const next = flat.find((m) => m.status === 'SCHEDULED' && new Date(m.kickoffTime).getTime() >= now)
  return next?.id ?? null
}
watch(
  [grouped, pageMounted, predictions, picksReady],
  async () => {
    if (didAutoScroll || !pageMounted.value || route.hash.startsWith('#match-')) return
    // Wait for predictions too: finished rows above the target grow a points
    // line once they load, which would otherwise push the target below the fold.
    // listEl only exists once picksReady (the pick cards stopped resizing the top).
    if (!grouped.value.length || !listEl.value || predictions.value === undefined) return
    const id = autoScrollTargetId()
    didAutoScroll = true
    if (!id) return
    // Make sure the region is sized (and thus scrollable) before scrolling into
    // it - the height watcher may not have applied its style yet on this tick.
    updateListHeight()
    await nextTick()
    const el = document.getElementById(`match-${id}`)
    if (!el) return
    const c = listEl.value
    if (contained.value && c) {
      c.scrollTo({ top: el.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop, behavior: 'smooth' })
    } else {
      // No scroll region: scroll the page itself (row's scroll-margin clears the header).
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  },
  { immediate: true, flush: 'post' },
)

function save(matchId: string, value: { home: number; away: number }) {
  upsert.mutate({ matchId, ...value })
}
// The whole card opens the match, but inner controls (score inputs, the joker
// button, the team links) keep handling their own clicks.
function openMatch(e: MouseEvent, id: string) {
  if ((e.target as HTMLElement).closest('a, button, input')) return
  navigateTo(`/${slug.value}/matches/${id}`)
}
const toast = useToast()
function toggleJoker(p: MyPrediction) {
  setJoker.mutate(
    { matchId: p.matchId, isJoker: !p.isJoker },
    {
      // Buttons are disabled when the round's joker is locked, so this is a rare
      // edge (e.g. a race) - a transient toast, not a layout-shifting banner.
      onError: (e: any) =>
        toast.add({
          severity: 'warn',
          summary: t('predictions.jokerError'),
          detail: e?.data?.message || e?.data?.statusMessage || undefined,
          life: 5000,
        }),
    },
  )
}
function fmtTime(d: string) {
  return new Date(d).toLocaleString(locale.value, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// The country picker is hidden until opened by Mod+F (Ctrl/Cmd, preventDefault
// on by default) or the search icon in the filter row. Closing clears the
// selection so the list returns to the full set.
const searchOpen = ref(false)
const countrySelect = ref<{ show?: () => void } | null>(null)
function openSearch() {
  searchOpen.value = true
  // Render the picker (v-if) then open its panel; the filter input autofocuses.
  nextTick(() => countrySelect.value?.show?.())
}
function closeSearch() {
  searchOpen.value = false
  selectedCountries.value = []
}
function toggleSearch() {
  searchOpen.value ? closeSearch() : openSearch()
}
useHotkey('Mod+F', openSearch)
// The picker shares the filter row and shifts its height - remeasure the list.
watch(searchOpen, () => nextTick(updateListHeight))
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-3 flex-wrap mb-5">
      <div class="flex items-center gap-2">
        <h1 class="text-2xl font-bold">{{ t('matches.title') }}</h1>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <CompetitionPill />
        <LeaguePill />
      </div>
    </div>
    <div v-if="stats" class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
      <div class="ng-card rounded-2xl border p-4 text-center" style="background: var(--p-content-background)">
        <div class="text-2xl font-extrabold tabular-nums" style="color: var(--p-primary-color)">{{ stats.totalPoints }}</div>
        <div class="text-xs mt-0.5" style="color: var(--p-text-muted-color)">{{ t('picks.points') }}</div>
      </div>
      <div class="ng-card rounded-2xl border p-4 text-center" style="background: var(--p-content-background)">
        <div class="text-2xl font-extrabold tabular-nums">{{ stats.rank ? `#${stats.rank}` : '-' }}</div>
        <div class="text-xs mt-0.5" style="color: var(--p-text-muted-color)">{{ t('picks.rank', { n: stats.players }) }}</div>
      </div>
      <div class="ng-card rounded-2xl border p-4 text-center" style="background: var(--p-content-background)">
        <div class="text-2xl font-extrabold tabular-nums">{{ stats.exact }}</div>
        <div class="text-xs mt-0.5" style="color: var(--p-text-muted-color)">{{ t('picks.exact') }}</div>
      </div>
      <div class="ng-card rounded-2xl border p-4 text-center" style="background: var(--p-content-background)">
        <div class="text-2xl font-extrabold tabular-nums">{{ stats.jokers }}</div>
        <div class="text-xs mt-0.5" style="color: var(--p-text-muted-color)">{{ t('picks.jokers', { n: stats.predictions }) }}</div>
      </div>
    </div>
    <div ref="picksEl" class="grid md:grid-cols-2 gap-4 mb-6">
      <ChampionPick />
      <BestScorerPick />
    </div>
    <div class="flex items-center gap-2 mb-4 flex-wrap">
      <SelectButton
        v-if="hasGroups"
        v-model="viewMode"
        :options="viewOptions"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        size="small"
        :aria-label="t('matches.view')"
      />
      <template v-if="viewMode === 'fixtures'">
      <button
        v-for="b in ALL_BUCKETS"
        :key="b"
        class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition"
        :style="
          activeBuckets.includes(b)
            ? 'background: color-mix(in srgb, var(--p-primary-color) 14%, transparent); border-color: var(--p-primary-color); color: var(--p-primary-color)'
            : 'border-color: var(--p-content-border-color); color: var(--p-text-muted-color); opacity: 0.7'
        "
        :aria-pressed="activeBuckets.includes(b)"
        @click="toggleBucket(b)"
      >
        <i :class="activeBuckets.includes(b) ? 'pi pi-check-circle' : 'pi pi-circle'" style="font-size: 0.7rem" />
        {{ t(`matches.filterStatus.${b}`) }}
      </button>
      <div class="flex items-center gap-2 ml-auto min-h-[33px]">
        <MultiSelect
          v-if="searchOpen"
          ref="countrySelect"
          v-model="selectedCountries"
          :options="teamOptions"
          option-label="name"
          option-value="code"
          size="small"
          display="chip"
          filter
          auto-filter-focus
          :filter-fields="['name', 'search']"
          :show-toggle-all="false"
          :placeholder="t('matches.search')"
          class="w-56 sm:w-72"
        />
        <button
          type="button"
          v-tooltip.bottom="t('matches.search')"
          class="inline-flex items-center justify-center w-8 h-8 rounded-full transition shrink-0"
          :class="searchOpen ? 'text-white' : 'hover:bg-black/5 dark:hover:bg-white/10'"
          :style="searchOpen ? 'background: var(--p-primary-color)' : 'background: var(--p-content-border-color)'"
          :aria-label="t('matches.search')"
          :aria-pressed="searchOpen"
          @click="toggleSearch"
        >
          <i class="pi pi-search" :style="searchOpen ? '' : 'color: var(--p-text-muted-color)'" />
        </button>
      </div>
      </template>
    </div>

    <template v-if="viewMode === 'standings'">
      <div v-if="!standings" class="opacity-60">{{ t('common.loading') }}</div>
      <div
        v-else
        ref="listEl"
        class="grid gap-6 md:grid-cols-2"
        :class="contained ? 'overflow-y-auto overscroll-contain pr-1' : ''"
        :style="{ maxHeight: listMaxH }"
      >
        <section
          v-for="g in standings"
          :key="g.group"
          class="ng-card rounded-2xl border p-4"
          style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
        >
          <h2 class="text-xs uppercase tracking-wider font-semibold mb-3" style="color: var(--p-text-muted-color)">{{ t('map.group') }} {{ g.group }}</h2>
          <StandingsTable :rows="g.rows" :slug="slug ?? undefined" />
        </section>
      </div>
    </template>

    <template v-else>
    <div v-if="isLoading || !picksReady" class="opacity-60">{{ t('common.loading') }}</div>
    <div v-else-if="!matches || !matches.length" class="opacity-60">{{ t('matches.empty') }}</div>
    <div v-else-if="!grouped.length" class="opacity-60">{{ t('matches.noResults') }}</div>

    <div v-else ref="listEl" class="flex flex-col gap-8" :class="contained ? 'overflow-y-auto overscroll-contain pr-1' : ''" :style="{ maxHeight: listMaxH }">
      <section v-for="g in grouped" :key="g.id">
        <button
          type="button"
          class="flex items-center justify-between w-full text-xs uppercase tracking-wider font-semibold mb-3 hover:opacity-80 transition"
          style="color: var(--p-text-muted-color)"
          :aria-expanded="!collapsedRounds.has(g.id)"
          @click="toggleRound(g.id)"
        >
          <span>{{ g.label }}</span>
          <i class="pi pi-chevron-down transition-transform" :class="{ '-rotate-90': collapsedRounds.has(g.id) }" style="font-size: 0.7rem" />
        </button>
        <div v-show="!collapsedRounds.has(g.id)" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="m in g.items"
            :id="`match-${m.id}`"
            :key="m.id"
            class="ng-card rounded-2xl border p-4 flex flex-col gap-3 cursor-pointer"
            style="background: var(--p-content-background); border-color: var(--p-content-border-color); scroll-margin-top: calc(var(--ng-header-h, 64px) + 16px)"
            @click="openMatch($event, m.id)"
          >
            <NuxtLink :to="`/${slug}/matches/${m.id}`" class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 group">
              <div class="flex items-center gap-2 min-w-0">
                <img v-if="flagUrl(m.homeTeamCode)" :src="flagUrl(m.homeTeamCode) || ''" class="w-6 h-6 rounded object-cover" alt="" >
                <span class="truncate font-medium group-hover:underline" :title="m.homeTeam">{{ m.homeTeam }}</span>
              </div>
              <div class="px-3 text-center shrink-0">
                <div v-if="m.fullTimeHome !== null" class="font-bold tabular-nums text-lg">
                  {{ m.fullTimeHome }}–{{ m.fullTimeAway }}
                  <span v-if="pensResult(m)" class="block text-[10px] font-normal leading-tight" style="color: var(--p-text-muted-color)">{{ pensResult(m) }} {{ t('match.pens') }}</span>
                </div>
                <div v-else class="text-sm" style="color: var(--p-text-muted-color)">vs</div>
                <div v-if="m.status === 'LIVE' || m.status === 'PAUSED'" class="flex items-center justify-center gap-1 text-[10px] font-bold" style="color: var(--ng-danger)">
                  <span class="w-1.5 h-1.5 rounded-full animate-pulse" style="background: var(--ng-danger)" />LIVE
                </div>
              </div>
              <div class="flex items-center gap-2 min-w-0 justify-end">
                <span class="truncate font-medium text-right group-hover:underline" :title="m.awayTeam">{{ m.awayTeam }}</span>
                <img v-if="flagUrl(m.awayTeamCode)" :src="flagUrl(m.awayTeamCode) || ''" class="w-6 h-6 rounded object-cover" alt="" >
              </div>
            </NuxtLink>

            <div class="flex items-center justify-between gap-2 text-xs" style="color: var(--p-text-muted-color)">
              <span class="flex items-center gap-2 min-w-0">
                <span class="truncate">{{ fmtTime(m.kickoffTime) }}<template v-if="m.group"> · {{ t('matches.group', { group: m.group }) }}</template></span>
                <Countdown v-if="m.status === 'SCHEDULED'" :to="m.kickoffTime" />
              </span>
              <Tag :value="matchStatusLabel(m.status, t)" :severity="statusSeverity(m.status)" />
            </div>

            <div class="flex flex-col items-center gap-2 pt-3 border-t" style="border-color: var(--p-content-border-color)">
              <ScoreInput
                :home="predByMatch[m.id]?.homeGoals ?? null"
                :away="predByMatch[m.id]?.awayGoals ?? null"
                :disabled="m.isLocked || !m.homeTeamCode || !m.awayTeamCode"
                @update="(v) => save(m.id, v)"
              />
              <!-- Reserved whenever the preference is on, so cards never resize. -->
              <div v-if="crowdEnabled">
                <CrowdLine :match-id="m.id" :totals="crowdTotals" :league-totals="leagueTotals" :league-active="leagueActive" label count />
              </div>
              <MatchOdds v-if="oddsEnabled" :odds="m.odds" />
              <!-- Always rendered on open matches (disabled until a pick exists) so saving never resizes the card. -->
              <div v-if="!m.isLocked || predByMatch[m.id]" class="flex items-center gap-3">
                <!-- single-match rounds: no joker to place; the final doubles for everyone -->
                <span v-if="countsDouble(m.stage)" v-tooltip.top="t('predictions.finalDoubleHint')" class="text-xs font-semibold px-2 py-1 rounded-full" style="color: var(--ng-star); background: var(--ng-star-soft)">★ {{ t('predictions.finalDouble') }}</span>
                <Button
                  v-else-if="!isSingleMatchStage(m.stage)"
                  v-tooltip.top="jokerRoundLocked(m) ? t('predictions.jokerRoundLocked') : undefined"
                  :label="t('predictions.joker')"
                  :icon="predByMatch[m.id]?.isJoker ? 'pi pi-star-fill' : 'pi pi-star'"
                  :severity="predByMatch[m.id]?.isJoker ? 'warn' : 'secondary'"
                  :outlined="!predByMatch[m.id]?.isJoker"
                  size="small"
                  :disabled="m.isLocked || !predByMatch[m.id] || jokerRoundLocked(m)"
                  @click="predByMatch[m.id] && toggleJoker(predByMatch[m.id])"
                />
                <span v-if="predByMatch[m.id]?.totalPoints != null" class="text-xs font-semibold" style="color: var(--p-primary-color)">
                  +{{ predByMatch[m.id].totalPoints }} pts · {{ tierLabel(predByMatch[m.id].baseTier, t) }}
                </span>
                <span
                  v-if="predByMatch[m.id]?.bonusPoints"
                  v-tooltip.top="predByMatch[m.id].crowdShare != null ? t('predictions.rarityTip', { pct: Math.round(Number(predByMatch[m.id].crowdShare) * 100) }) : t('predictions.rarityTipNoShare')"
                  class="text-xs font-semibold px-1.5 py-0.5 rounded-full cursor-help"
                  style="color: var(--ng-star); background: var(--ng-star-soft)"
                >+{{ predByMatch[m.id].bonusPoints }} {{ t('predictions.rarity') }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
    </template>
  </div>
</template>
