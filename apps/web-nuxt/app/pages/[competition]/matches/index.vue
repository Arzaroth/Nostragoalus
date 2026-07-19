<script setup lang="ts">
import { useHotkey } from '@tanstack/vue-hotkeys'
import { IN_PLAY_STATUSES } from '#shared/types/match'
const { t, locale } = useI18n()
useHead({ title: t('nav.matches') })
const { enabled: crowdEnabled, totals: crowdTotals, leagueTotals, leagueActive } = useCrowdTotals()
// Read-only reaction tallies per card, bulk-fetched once for the competition and
// kept live (one instance owns the WS connection); a card click still navigates
// to the match to react there.
const {
  totals: reactionTotals,
  leagueTotals: reactionLeagueTotals,
  leagueActive: reactionLeagueActive,
  mine: reactionMine,
} = useCompetitionReactions()
const oddsEnabled = useOddsPreference()
const slug = useSelectedCompetition()
const { data: matches, isLoading } = useMatches()

// Status filter buckets: all on by default, untick to hide. ?status=live
// (comma list) pre-selects, e.g. the home CTA's "N matches in play" link.
const route = useRoute()
// Chip order is a past->future timeline, mirroring the page (oldest first).
const STATUS_BUCKETS = {
  fulltime: ['FINISHED', 'AWARDED'],
  // Sourced from the shared in-play set so the live bucket can't drift from the
  // rest of the app (crowd-lean, the per-match isLive, the started gate).
  live: IN_PLAY_STATUSES,
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
type ViewMode = 'fixtures' | 'standings' | 'stats'
const parseView = (v: unknown): ViewMode => (v === 'standings' || v === 'stats' ? v : 'fixtures')
const viewMode = ref<ViewMode>(parseView(route.query.view))
// Toggle visibility comes from the fixtures we already loaded - no extra request
// just to decide whether to offer the view. The tables themselves load lazily,
// only once Standings/Stats is actually open.
const hasGroups = computed(() => (matches.value ?? []).some((m) => !!m.group))
const { data: standings } = useStandings(() => viewMode.value === 'standings')
const { data: rankings } = useScorers(() => viewMode.value === 'stats')
const viewOptions = computed(() => [
  { label: t('matches.viewFixtures'), value: 'fixtures' as const },
  { label: t('matches.viewStandings'), value: 'standings' as const },
  { label: t('matches.viewStats'), value: 'stats' as const },
])
// Both Stats boards share the same card chrome; only the heading and which
// ranked list they draw from differ, so render them from one v-for (mirrors the
// standings v-for). Each list is already ranked/sliced server-side per metric.
const statBoards = [
  { title: 'stats.topScorers', metric: 'goals' as const, key: 'scorers' as const },
  { title: 'stats.topAssists', metric: 'assists' as const, key: 'assists' as const },
]
// Mirror the mode in the URL (shareable), dropping it for the default.
watch(viewMode, (v) => router.replace({ query: { ...route.query, view: v === 'fixtures' ? undefined : v } }))
// The view toggle only renders alongside group standings, so a competition with
// no group stage can't stay on a non-fixtures view (e.g. switching to a
// knockout-only tournament while Standings/Stats is open).
watch(hasGroups, (has) => {
  if (!has && viewMode.value !== 'fixtures') viewMode.value = 'fixtures'
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
const { leagueId, league: pilledLeague, leagues: myLeagues } = useSelectedLeague()
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

// Fixtures still open (kickoff ahead, both teams known) that the user hasn't
// predicted - the "needs a pick before the next lockout" nudge. Derived from the
// matches/predictions already on the page; the matches list is kickoff-ordered,
// so firstOutstandingPickId is the soonest one.
const predictedIds = computed(() => new Set(Object.keys(predByMatch.value)))
const outstandingCount = computed(() => countOutstandingPicks(matches.value ?? [], predictedIds.value))

// League-mode pick context. The pilled league decides the editing target: when a
// moded league is pilled and switched to custom, score/stake saves land on that
// league's override; otherwise they land on the shared base pick.
const HARD_BUDGET_PER_MATCH = 3
const isModedPilled = computed(() => !!pilledLeague.value && pilledLeague.value.mode !== 'NORMAL')
const customLeague = computed(() => isModedPilled.value && !pilledLeague.value!.picksSynced)
const hasHardLeague = computed(() => myLeagues.value?.some((l) => l.mode === 'HARD') ?? false)
const hasOutcomeLeague = computed(() => myLeagues.value?.some((l) => l.mode === 'EASY' || l.mode === 'HARDCORE') ?? false)
// Stake stepper shows when a HARD context is relevant; quick-pick when an
// outcome-only context is.
const showStake = computed(() => pilledLeague.value?.mode === 'HARD' || (!isModedPilled.value && hasHardLeague.value))
const showQuickPick = computed(() =>
  pilledLeague.value ? pilledLeague.value.mode === 'EASY' || pilledLeague.value.mode === 'HARDCORE' : hasOutcomeLeague.value,
)

const { upsertOverride, setPicksSynced, setOverrideJoker } = useLeaguePickMutations()
const overridesQ = useLeagueOverrides(leagueId, customLeague)
const overrideByMatch = computed(() => overridesQ.data.value ?? {})

// Effective pick for a card: the override when editing a custom league, else base.
function effective(matchId: string) {
  if (customLeague.value && overrideByMatch.value[matchId]) return overrideByMatch.value[matchId]
  return predByMatch.value[matchId]
}
function effHome(id: string): number | null {
  return effective(id)?.homeGoals ?? null
}
function effAway(id: string): number | null {
  return effective(id)?.awayGoals ?? null
}
function effWager(id: string): number | null {
  return effective(id)?.wager ?? null
}

function roundBudget(roundId: string): number {
  return (matches.value ?? []).filter((m) => m.roundId === roundId).length * HARD_BUDGET_PER_MATCH
}
function roundUsed(roundId: string): number {
  let used = 0
  for (const m of matches.value ?? []) if (m.roundId === roundId) used += effWager(m.id) ?? 0
  return used
}

// The completeness nudge: leagues with a mode-specific gap (a real score for
// NORMAL, a stake for HARD). A plain missing pick (NEEDS_PICK) is deliberately
// left out - the base "N match needs a pick" banner already covers it, and for
// all-normal leagues that made this panel a redundant per-league repeat of the
// banner that did not scale past a few leagues.
const completenessQ = useLeagueCompleteness(slug)
const incompleteLeagues = computed(() =>
  (completenessQ.data.value ?? []).filter((c) => c.summary.incomplete > 0),
)
function nudgeText(c: { summary: { needsExact: number; needsStake: number } }): string {
  const parts: string[] = []
  if (c.summary.needsExact) parts.push(t('leagues.nudgeNeedsExact', { n: c.summary.needsExact }))
  if (c.summary.needsStake) parts.push(t('leagues.nudgeNeedsStake', { n: c.summary.needsStake }))
  return parts.join(' · ')
}
// Per-match completeness chips: which of the user's leagues still need this
// match's pick fixed. Only mode-specific gaps (a real score, a stake) - a plain
// missing pick is the base banner's job, not a per-league chip.
const issuesByMatch = computed(() => {
  const map = new Map<string, { name: string; reason: string }[]>()
  for (const c of completenessQ.data.value ?? []) {
    for (const iss of c.issues) {
      if (iss.reason === 'NEEDS_PICK') continue
      const entry = { name: c.name, reason: iss.reason }
      const list = map.get(iss.matchId)
      if (list) list.push(entry)
      else map.set(iss.matchId, [entry])
    }
  }
  return map
})
// issuesByMatch drops NEEDS_PICK, so a chip is only ever a score or a stake gap.
function reasonLabel(reason: string): string {
  return reason === 'NEEDS_STAKE' ? t('leagues.reasonStake') : t('leagues.reasonScore')
}

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
// ... except rounds whose matches have all been played, which start collapsed
// (the last round - the final - always stays open). Seeded from the unfiltered
// list once per competition, so the status filter can't fake a "done" round and
// a refetch can't undo a manual toggle.
let seededRoundsFor: string | null = null
watch(
  [matches, slug],
  () => {
    const list = matches.value
    if (!list?.length || seededRoundsFor === slug.value) return
    seededRoundsFor = slug.value
    const rounds = new Map<string, { sort: number; done: boolean }>()
    for (const m of list) {
      const r = rounds.get(m.roundId) ?? { sort: m.roundSortOrder, done: true }
      if (bucketOf(m.status) !== 'fulltime') r.done = false
      rounds.set(m.roundId, r)
    }
    const last = Math.max(...[...rounds.values()].map((r) => r.sort))
    collapsedRounds.value = new Set(
      [...rounds].filter(([, r]) => r.done && r.sort !== last).map(([id]) => id),
    )
  },
  { immediate: true },
)

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
    // A concluded round starts collapsed, and a v-show'd row can't be scrolled
    // to - open the anchored match's round first.
    const roundId = (matches.value ?? []).find((m) => `match-${m.id}` === target)?.roundId
    if (roundId && collapsedRounds.value.has(roundId)) {
      const next = new Set(collapsedRounds.value)
      next.delete(roundId)
      collapsedRounds.value = next
    }
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

// On first load - and again whenever the user returns to the Fixtures view -
// bring the action into view inside the list: the first live match, or failing
// that the next upcoming one. A hash anchor (home CTA) wins.
let didAutoScroll = false
function autoScrollTargetId(): string | null {
  const flat = grouped.value.flatMap((g) => g.items)
  const live = flat.find((m) => (STATUS_BUCKETS.live as readonly string[]).includes(m.status))
  if (live) return live.id
  const now = Date.now()
  const next = flat.find((m) => m.status === 'SCHEDULED' && new Date(m.kickoffTime).getTime() >= now)
  // Nothing live or upcoming means the competition is over - land on its last
  // match (the final), the one round that stays expanded.
  return next?.id ?? flat.at(-1)?.id ?? null
}
// Scroll a match row into view, honoring the contained scroll region when the
// list owns one (otherwise scroll the page; the row's scroll-margin clears the
// header). Shared by the first-upcoming auto-scroll and the outstanding-picks
// jump action.
async function scrollToMatch(id: string) {
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
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}
watch(
  [grouped, pageMounted, predictions, picksReady, viewMode],
  async () => {
    // Standings reuses listEl, so never scroll it; leaving Fixtures re-arms the
    // one-shot so switching back re-scrolls to the first upcoming match.
    if (viewMode.value !== 'fixtures') {
      didAutoScroll = false
      return
    }
    if (didAutoScroll || !pageMounted.value || route.hash.startsWith('#match-')) return
    // Wait for predictions too: finished rows above the target grow a points
    // line once they load, which would otherwise push the target below the fold.
    // listEl only exists once picksReady (the pick cards stopped resizing the top).
    if (!grouped.value.length || !listEl.value || predictions.value === undefined) return
    const id = autoScrollTargetId()
    didAutoScroll = true
    if (!id) return
    await scrollToMatch(id)
  },
  { immediate: true, flush: 'post' },
)

// "Jump to first" on the outstanding-picks nudge. The fixtures list is the only
// view that renders the rows, and the soonest unpicked one may be hidden by the
// active view, the status/country filters, or a collapsed round - reveal all of
// those before scrolling to it. Claim the one-shot auto-scroll so switching back
// to fixtures doesn't fight this jump for the scroll position.
function jumpToFirstUnpicked() {
  const id = firstOutstandingPickId(matches.value ?? [], predictedIds.value)
  if (!id) return
  if (viewMode.value !== 'fixtures') viewMode.value = 'fixtures'
  if (!activeBuckets.value.includes('upcoming')) activeBuckets.value = [...activeBuckets.value, 'upcoming']
  if (selectedCountries.value.length) selectedCountries.value = []
  const roundId = (matches.value ?? []).find((m) => m.id === id)?.roundId
  if (roundId && collapsedRounds.value.has(roundId)) {
    const next = new Set(collapsedRounds.value)
    next.delete(roundId)
    collapsedRounds.value = next
  }
  didAutoScroll = true
  nextTick(() => scrollToMatch(id))
}

function pickError(e: any) {
  toast.add({
    severity: 'warn',
    summary: t('predictions.saveError'),
    detail: e?.data?.message || e?.data?.statusMessage || undefined,
    life: 5000,
  })
}
// A save lands on the pilled custom league's override, or on the shared base pick.
function save(matchId: string, value: { home: number; away: number; isOutcomeOnly: boolean }) {
  if (customLeague.value && leagueId.value) {
    upsertOverride.mutate({ leagueId: leagueId.value, matchId, ...value }, { onError: pickError })
  } else {
    upsert.mutate({ matchId, ...value }, { onError: pickError })
  }
}
// Staking re-sends the current score with the new wager (same target as the score).
function saveStake(matchId: string, wager: number) {
  const e = effective(matchId)
  if (!e) return
  if (customLeague.value && leagueId.value) {
    upsertOverride.mutate({ leagueId: leagueId.value, matchId, home: e.homeGoals, away: e.awayGoals, wager }, { onError: pickError })
  } else {
    upsert.mutate({ matchId, home: e.homeGoals, away: e.awayGoals, wager }, { onError: pickError })
  }
}
function toggleSync() {
  if (!leagueId.value || !pilledLeague.value) return
  setPicksSynced.mutate({ leagueId: leagueId.value, synced: !pilledLeague.value.picksSynced }, { onError: pickError })
}
// The whole card opens the match, but inner controls (score inputs, the joker
// button, the team links) keep handling their own clicks.
function openMatch(e: MouseEvent, id: string) {
  if ((e.target as HTMLElement).closest('a, button, input')) return
  navigateTo(`/${slug.value}/matches/${id}`)
}
const toast = useToast()
// Joker targets the league override when editing a custom moded league, else the
// base pick. effJoker reads the effective pick's current joker state.
function effJoker(matchId: string): boolean {
  return !!effective(matchId)?.isJoker
}
function toggleJoker(matchId: string) {
  const onError = (e: any) =>
    toast.add({
      // Buttons are disabled when the round's joker is locked, so this is a rare
      // edge (e.g. a race) - a transient toast, not a layout-shifting banner.
      severity: 'warn',
      summary: t('predictions.jokerError'),
      detail: e?.data?.message || e?.data?.statusMessage || undefined,
      life: 5000,
    })
  const next = !effJoker(matchId)
  if (customLeague.value && leagueId.value) {
    setOverrideJoker.mutate({ leagueId: leagueId.value, matchId, isJoker: next }, { onError })
  } else {
    setJoker.mutate({ matchId, isJoker: next }, { onError })
  }
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
    <div
      v-if="outstandingCount > 0"
      class="flex items-center justify-between gap-3 mb-5 rounded-2xl border px-4 py-3"
      style="background: color-mix(in srgb, var(--p-primary-color) 8%, var(--p-content-background)); border-color: var(--p-primary-color)"
    >
      <div class="flex items-center gap-2 text-sm">
        <i class="pi pi-exclamation-circle" style="color: var(--p-primary-color)" />
        <span>{{ t('matches.outstanding.label', { n: outstandingCount }, outstandingCount) }}</span>
      </div>
      <Button size="small" :label="t('matches.outstanding.jump')" icon="pi pi-arrow-down" severity="primary" text @click="jumpToFirstUnpicked" />
    </div>
    <div ref="picksEl" data-tour="champion" class="grid md:grid-cols-2 gap-4 mb-6">
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
      <div class="flex items-center gap-2 ms-auto min-h-[33px]">
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
        :class="contained ? 'overflow-y-auto overscroll-contain pe-1' : ''"
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

    <template v-else-if="viewMode === 'stats'">
      <div v-if="!rankings" class="opacity-60">{{ t('common.loading') }}</div>
      <div v-else-if="!rankings.scorers.length && !rankings.assists.length" class="opacity-60">{{ t('stats.empty') }}</div>
      <div v-else class="grid gap-6 md:grid-cols-2">
        <section
          v-for="b in statBoards"
          :key="b.metric"
          class="ng-card rounded-2xl border p-4"
          style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
        >
          <h2 class="text-xs uppercase tracking-wider font-semibold mb-3" style="color: var(--p-text-muted-color)">{{ t(b.title) }}</h2>
          <PlayerRankingTable :rows="rankings[b.key]" :metric="b.metric" />
        </section>
      </div>
    </template>

    <template v-else>
    <div
      v-if="isModedPilled"
      class="mb-4 flex items-center gap-3 flex-wrap rounded-xl border px-4 py-2 text-sm"
      style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
    >
      <i class="pi pi-sliders-h" style="color: var(--p-primary-color)" />
      <span>{{ t('leagues.editingFor', { name: pilledLeague!.name }) }}</span>
      <LeagueModeBadge :mode="pilledLeague!.mode" :lives="pilledLeague!.lives" />
      <span class="flex-1" />
      <Button
        size="small"
        :outlined="customLeague"
        :severity="customLeague ? 'secondary' : undefined"
        :label="customLeague ? t('leagues.followMain') : t('leagues.customize')"
        :loading="setPicksSynced.isPending.value"
        @click="toggleSync"
      />
    </div>

    <div
      v-if="incompleteLeagues.length"
      class="mb-4 rounded-xl border border-dashed px-4 py-2 text-xs"
      style="border-color: var(--ng-star)"
    >
      <div class="font-semibold mb-1" style="color: var(--ng-star)"><i class="pi pi-exclamation-circle" /> {{ t('leagues.nudgeTitle') }}</div>
      <div v-for="c in incompleteLeagues" :key="c.leagueId" style="color: var(--p-text-muted-color)">
        <span class="font-medium">{{ c.name }}</span> · {{ nudgeText(c) }}
      </div>
    </div>

    <div v-if="isLoading || !picksReady" class="opacity-60">{{ t('common.loading') }}</div>
    <div v-else-if="!matches || !matches.length" class="opacity-60">{{ t('matches.empty') }}</div>
    <div v-else-if="!grouped.length" class="opacity-60">{{ t('matches.noResults') }}</div>

    <div v-else ref="listEl" class="flex flex-col gap-8" :class="contained ? 'overflow-y-auto overscroll-contain pe-1' : ''" :style="{ maxHeight: listMaxH }">
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
            data-tour="predict"
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
                <span class="truncate font-medium text-end group-hover:underline" :title="m.awayTeam">{{ m.awayTeam }}</span>
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
              <MatchPickControls
                :home="effHome(m.id)"
                :away="effAway(m.id)"
                :wager="effWager(m.id)"
                :disabled="!isMatchPickable(m)"
                :show-quick-pick="showQuickPick"
                :show-stake="showStake"
                :home-code="m.homeTeamCode"
                :away-code="m.awayTeamCode"
                :budget-used="showStake ? roundUsed(m.roundId) : undefined"
                :budget-total="showStake ? roundBudget(m.roundId) : undefined"
                @save="(v) => save(m.id, v)"
                @save-stake="(w) => saveStake(m.id, w)"
              />
              <!-- Per-league completeness chips: leagues where this match's pick
                   still needs attention. -->
              <div v-if="issuesByMatch.get(m.id)?.length" class="flex flex-wrap justify-center gap-1">
                <span
                  v-for="(iss, idx) in issuesByMatch.get(m.id)"
                  :key="idx"
                  class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full"
                  style="color: var(--ng-star); background: var(--ng-star-soft)"
                >
                  <i class="pi pi-exclamation-circle" style="font-size: 0.6rem" />{{ iss.name }}: {{ reasonLabel(iss.reason) }}
                </span>
              </div>
              <!-- Reserved whenever the preference is on, so cards never resize. -->
              <div v-if="crowdEnabled">
                <CrowdLine :match-id="m.id" :totals="crowdTotals" :league-totals="leagueTotals" :league-active="leagueActive" label count />
              </div>
              <MatchOdds v-if="oddsEnabled" :odds="m.odds" />
              <MatchReactionsLine
                :match-id="m.id"
                :totals="reactionTotals"
                :league-totals="reactionLeagueTotals"
                :league-active="reactionLeagueActive"
                :mine="reactionMine"
              />
              <!-- Always rendered on open matches (disabled until a pick exists) so saving never resizes the card. -->
              <div v-if="!m.isLocked || predByMatch[m.id]" class="flex items-center gap-3">
                <!-- single-match rounds: no joker to place; the final doubles for everyone -->
                <span v-if="countsDouble(m.stage)" v-tooltip.top="t('predictions.finalDoubleHint')" class="text-xs font-semibold px-2 py-1 rounded-full" style="color: var(--ng-star); background: var(--ng-star-soft)">★ {{ t('predictions.finalDouble') }}</span>
                <Button
                  v-else-if="!isSingleMatchStage(m.stage)"
                  v-tooltip.top="jokerRoundLocked(m) ? t('predictions.jokerRoundLocked') : undefined"
                  :label="t('predictions.joker')"
                  :icon="effJoker(m.id) ? 'pi pi-star-fill' : 'pi pi-star'"
                  :severity="effJoker(m.id) ? 'warn' : 'secondary'"
                  :outlined="!effJoker(m.id)"
                  size="small"
                  :disabled="m.isLocked || !effective(m.id) || jokerRoundLocked(m)"
                  @click="effective(m.id) && toggleJoker(m.id)"
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
                <SharePickButton v-if="predByMatch[m.id]" :match-id="m.id" :kickoff-time="m.kickoffTime" />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
    </template>
  </div>
</template>
