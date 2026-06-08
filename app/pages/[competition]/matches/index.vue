<script setup lang="ts">
const { t } = useI18n()
const { totals: crowdTotals } = useCrowdTotals()
const slug = useSelectedCompetition()
const { data: matches, isLoading } = useMatches()
const { data: predictions } = useMyPredictions()
const { upsert, setJoker } = usePredictionMutations()

const predByMatch = computed(() => {
  const map: Record<string, MyPrediction> = {}
  for (const p of predictions.value ?? []) map[p.matchId] = p
  return map
})

const search = ref('')
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
function toggleJoker(p: MyPrediction) {
  setJoker.mutate({ matchId: p.matchId, isJoker: !p.isJoker })
}
function fmtTime(d: string) {
  return new Date(d).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-3 flex-wrap mb-5">
      <h1 class="text-2xl font-bold">{{ t('matches.title') }}</h1>
      <CompetitionPill />
    </div>
    <ChampionPick />
    <IconField class="mb-5 block w-full sm:w-96">
      <InputIcon class="pi pi-search" />
      <InputText v-model="search" :placeholder="t('matches.search')" class="w-full" />
    </IconField>
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
                <div v-if="m.status === 'LIVE' || m.status === 'PAUSED'" class="flex items-center justify-center gap-1 text-[10px] font-bold" style="color: #ef4444">
                  <span class="w-1.5 h-1.5 rounded-full animate-pulse" style="background: #ef4444" />LIVE
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
              <div v-if="crowdTotals[m.id]" class="text-xs tabular-nums" style="color: var(--p-text-muted-color)" :title="t('prefs.crowd')">
                👥 {{ t('predictions.crowd') }}: {{ crowdTotals[m.id].home }}–{{ crowdTotals[m.id].away }} ({{ crowdTotals[m.id].count }})
              </div>
              <!-- Always rendered on open matches (disabled until a pick exists) so saving never resizes the card. -->
              <div v-if="!m.isLocked || predByMatch[m.id]" class="flex items-center gap-3">
                <Button
                  :label="predByMatch[m.id]?.isJoker ? '★ Joker' : 'Joker'"
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
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
