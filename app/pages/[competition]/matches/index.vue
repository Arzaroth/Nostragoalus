<script setup lang="ts">
import { useHotkey } from '@tanstack/vue-hotkeys'
const { t } = useI18n()
const { enabled: crowdEnabled, totals: crowdTotals, leagueTotals, leagueActive } = useCrowdTotals()
const oddsEnabled = useOddsPreference()
const slug = useSelectedCompetition()
const { data: matches, isLoading } = useMatches()
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
    if (q && !searchable(`${m.homeTeam} ${m.awayTeam} ${m.homeTeamCode ?? ''} ${m.awayTeamCode ?? ''}`).includes(q)) continue
    const g = groups.get(m.roundId) ?? { label: m.roundLabel, sort: m.roundSortOrder, items: [] }
    g.items.push(m)
    groups.set(m.roundId, g)
  }
  return [...groups.values()].sort((a, b) => a.sort - b.sort)
})

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
          class="inline-flex items-center justify-center w-8 h-8 rounded-full transition hover:bg-black/5 dark:hover:bg-white/10"
          :aria-label="t('matches.search')"
          @click="openSearch"
        >
          <i class="pi pi-search" style="color: var(--p-text-muted-color)" />
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
    <!-- Hidden until opened (Mod+F or the title's search icon); on open it
         scrolls to the top of the viewport (scroll-margin clears the header). -->
    <div v-if="searchOpen" ref="searchBar" class="mb-3" style="scroll-margin-top: calc(var(--ng-header-h, 4rem) + 0.5rem)">
      <IconField class="block w-full sm:w-96">
        <InputIcon class="pi pi-search" />
        <InputText ref="searchInput" v-model="searchRaw" :placeholder="t('matches.search')" class="w-full" @keydown.esc="closeSearch" />
        <InputIcon v-if="searchRaw" class="pi pi-times cursor-pointer" :aria-label="t('common.clear')" @click="searchRaw = ''" />
      </IconField>
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
            :key="m.id"
            class="ng-card rounded-2xl border p-4 flex flex-col gap-3"
            style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
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
