<script setup lang="ts">
import { useHotkey } from '@tanstack/vue-hotkeys'
const { t } = useI18n()
useHead({ title: t('nav.matches') })
const { enabled: crowdEnabled, totals: crowdTotals, leagueTotals, leagueActive } = useCrowdTotals()
const oddsEnabled = useOddsPreference()
const slug = useSelectedCompetition()
const { data: matches, isLoading } = useMatches()
useLiveMatches(matches)

// Status filter buckets: all on by default, untick to hide. ?status=live
// (comma list) pre-selects, e.g. the home CTA's "N matches in play" link.
const route = useRoute()
const STATUS_BUCKETS = {
  upcoming: ['SCHEDULED', 'POSTPONED', 'CANCELLED'],
  live: ['LIVE', 'PAUSED', 'SUSPENDED'],
  finished: ['FINISHED', 'AWARDED'],
} as const
type StatusBucket = keyof typeof STATUS_BUCKETS
const ALL_BUCKETS = Object.keys(STATUS_BUCKETS) as StatusBucket[]
const fromQuery = String(route.query.status ?? '')
  .split(',')
  .filter((b): b is StatusBucket => ALL_BUCKETS.includes(b as StatusBucket))
const activeBuckets = ref<StatusBucket[]>(fromQuery.length ? fromQuery : [...ALL_BUCKETS])
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

const { data: predictions } = useMyPredictions()
const { upsert, setJoker } = usePredictionMutations()

// Your standing (folded in from the removed My Picks page). Honors the league
// pill: with a league selected, rank/players are within that league.
const { leagueId } = useSelectedLeague()
const { data: statsData } = await useFetch<{ stats: { rank: number | null; players: number; totalPoints: number; exact: number; predictions: number; jokers: number } | null }>(
  '/api/me/stats',
  { query: computed(() => (leagueId.value ? { league: leagueId.value } : slug.value ? { competition: slug.value } : {})) },
)
const stats = computed(() => statsData.value?.stats)

const predByMatch = computed(() => {
  const map: Record<string, MyPrediction> = {}
  for (const p of predictions.value ?? []) map[p.matchId] = p
  return map
})

// Immediate model for the field; the (debounced) value drives filtering.
const searchRaw = ref('')
const search = refDebounced(searchRaw, 200)
const grouped = computed(() => {
  const q = searchable(search.value.trim())
  const groups = new Map<string, { label: string; sort: number; items: MatchListItem[] }>()
  for (const m of matches.value ?? []) {
    if (!activeBuckets.value.includes(bucketOf(m.status))) continue
    if (q && !searchable(`${m.homeTeam} ${m.awayTeam} ${m.homeTeamCode ?? ''} ${m.awayTeamCode ?? ''}`).includes(q)) continue
    const g = groups.get(m.roundId) ?? { label: m.roundLabel, sort: m.roundSortOrder, items: [] }
    g.items.push(m)
    groups.set(m.roundId, g)
  }
  return [...groups.values()].sort((a, b) => a.sort - b.sort)
})

// Hash anchors (e.g. the home page's next-match CTA) point at rows that only
// exist once the query resolves AND the page is mounted - the router's own
// hash scroll fires before either. Retry whenever the rendered list or mount
// state changes, until the target exists. scrollIntoView honors the rows'
// scroll-margin-top, unlike the router's hash scroll.
const pageMounted = useMounted()
let hashScrolled = false
watch(
  [grouped, pageMounted],
  async () => {
    const target = route.hash.startsWith('#match-') ? route.hash.slice(1) : null
    if (hashScrolled || !target || !pageMounted.value) return
    await nextTick()
    const el = document.getElementById(target)
    if (!el) return
    hashScrolled = true
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  },
  { immediate: true, flush: 'post' },
)

function save(matchId: string, value: { home: number; away: number }) {
  upsert.mutate({ matchId, ...value })
}
const jokerErr = ref('')
function toggleJoker(p: MyPrediction) {
  jokerErr.value = ''
  setJoker.mutate(
    { matchId: p.matchId, isJoker: !p.isJoker },
    { onError: (e: any) => (jokerErr.value = e?.data?.message || e?.data?.statusMessage || t('predictions.jokerError')) },
  )
}
function fmtTime(d: string) {
  return new Date(d).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// The filter is hidden until opened by Mod+F (Ctrl/Cmd, preventDefault on by
// default) or the search icon by the title. Opening scrolls it to the top of
// the viewport (below the header) and focuses it. Escape closes + clears.
const searchOpen = ref(false)
const searchInput = ref<{ $el?: HTMLInputElement } | null>(null)
const searchBar = ref<HTMLElement | null>(null)
async function openSearch() {
  searchOpen.value = true
  await nextTick()
  searchBar.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  searchInput.value?.$el?.focus({ preventScroll: true })
}
function closeSearch() {
  searchOpen.value = false
  searchRaw.value = ''
}
function toggleSearch() {
  searchOpen.value ? closeSearch() : openSearch()
}
useHotkey('Mod+F', openSearch)
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-3 flex-wrap mb-5">
      <div class="flex items-center gap-2">
        <h1 class="text-2xl font-bold">{{ t('matches.title') }}</h1>
        <button
          type="button"
          v-tooltip.bottom="t('matches.search')"
          class="inline-flex items-center justify-center w-8 h-8 rounded-full transition"
          :class="searchOpen ? 'text-white' : 'hover:bg-black/5 dark:hover:bg-white/10'"
          :style="searchOpen ? 'background: var(--p-primary-color)' : 'background: var(--p-content-border-color)'"
          :aria-label="t('matches.search')"
          :aria-pressed="searchOpen"
          @click="toggleSearch"
        >
          <i class="pi pi-search" :style="searchOpen ? '' : 'color: var(--p-text-muted-color)'" />
        </button>
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
    <ChampionPick />
    <BestScorerPick />
    <Message v-if="jokerErr" severity="warn" class="mb-4">{{ jokerErr }}</Message>
    <!-- Hidden until opened (Mod+F or the title's search icon). On open it
         scrolls to the top (scroll-margin clears the header), then sticks there
         so it follows the scroll. -->
    <div v-if="searchOpen" ref="searchBar" class="sticky z-30 py-1 mb-3" style="top: var(--ng-header-h, 4rem); scroll-margin-top: calc(var(--ng-header-h, 4rem) + 0.5rem)">
      <IconField class="block w-full sm:w-96">
        <InputIcon class="pi pi-search" />
        <InputText ref="searchInput" v-model="searchRaw" :placeholder="t('matches.search')" class="w-full" @keydown.esc="closeSearch" />
        <InputIcon v-if="searchRaw" class="pi pi-times cursor-pointer" :aria-label="t('common.clear')" @click="searchRaw = ''" />
      </IconField>
    </div>
    <div class="flex items-center gap-2 mb-4 flex-wrap">
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
    </div>

    <div v-if="isLoading" class="opacity-60">{{ t('common.loading') }}</div>
    <div v-else-if="!matches || !matches.length" class="opacity-60">{{ t('matches.empty') }}</div>
    <div v-else-if="!grouped.length" class="opacity-60">{{ t('matches.noResults') }}</div>

    <div v-else class="flex flex-col gap-8">
      <section v-for="g in grouped" :key="g.label">
        <h2 class="text-xs uppercase tracking-wider font-semibold mb-3" style="color: var(--p-text-muted-color)">{{ g.label }}</h2>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="m in g.items"
            :id="`match-${m.id}`"
            :key="m.id"
            class="ng-card rounded-2xl border p-4 flex flex-col gap-3"
            style="background: var(--p-content-background); border-color: var(--p-content-border-color); scroll-margin-top: calc(var(--ng-header-h, 64px) + 16px)"
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
                <span class="truncate">{{ fmtTime(m.kickoffTime) }}<template v-if="m.group"> · Grp {{ m.group }}</template></span>
                <Countdown v-if="m.status === 'SCHEDULED'" :to="m.kickoffTime" />
              </span>
              <Tag :value="matchStatusLabel(m.status)" :severity="statusSeverity(m.status)" />
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
                <span v-if="countsDouble(m.stage)" class="text-xs font-semibold px-2 py-1 rounded-full" style="color: var(--ng-star); background: var(--ng-star-soft)" :title="t('predictions.finalDoubleHint')">★ {{ t('predictions.finalDouble') }}</span>
                <Button
                  v-else-if="!isSingleMatchStage(m.stage)"
                  :label="t('predictions.joker')"
                  :icon="predByMatch[m.id]?.isJoker ? 'pi pi-star-fill' : 'pi pi-star'"
                  :severity="predByMatch[m.id]?.isJoker ? 'warn' : 'secondary'"
                  :outlined="!predByMatch[m.id]?.isJoker"
                  size="small"
                  :disabled="m.isLocked || !predByMatch[m.id]"
                  @click="predByMatch[m.id] && toggleJoker(predByMatch[m.id])"
                />
                <span v-if="predByMatch[m.id]?.totalPoints != null" class="text-xs font-semibold" style="color: var(--p-primary-color)">
                  +{{ predByMatch[m.id].totalPoints }} pts · {{ tierLabel(predByMatch[m.id].baseTier) }}
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
  </div>
</template>
