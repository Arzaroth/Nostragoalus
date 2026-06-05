<script setup lang="ts">
const { data: matches, isLoading } = useMatches()
const { data: predictions } = useMyPredictions()
const { upsert, setJoker } = usePredictionMutations()

const predByMatch = computed(() => {
  const map: Record<string, MyPrediction> = {}
  for (const p of predictions.value ?? []) map[p.matchId] = p
  return map
})

const grouped = computed(() => {
  const groups = new Map<string, { label: string; sort: number; items: MatchListItem[] }>()
  for (const m of matches.value ?? []) {
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
    <h1 class="text-2xl font-bold mb-5">Fixtures</h1>
    <div v-if="isLoading" class="opacity-60">Loading fixtures…</div>
    <div v-else-if="!matches || !matches.length" class="opacity-60">
      No fixtures yet — import them from the <NuxtLink to="/admin" class="underline">admin page</NuxtLink>.
    </div>

    <div v-else class="flex flex-col gap-8">
      <section v-for="g in grouped" :key="g.label">
        <h2 class="text-xs uppercase tracking-wider font-semibold mb-3" style="color: var(--p-text-muted-color)">{{ g.label }}</h2>
        <div class="grid gap-3 sm:grid-cols-2">
          <div
            v-for="m in g.items"
            :key="m.id"
            class="ng-card rounded-2xl border p-4 flex flex-col gap-3"
            style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
          >
            <NuxtLink :to="`/matches/${m.id}`" class="flex items-center justify-between gap-2 group">
              <div class="flex items-center gap-2 flex-1 min-w-0">
                <img v-if="flagUrl(m.homeTeamCode)" :src="flagUrl(m.homeTeamCode) || ''" class="w-6 h-6 rounded object-cover" alt="" >
                <span class="truncate font-medium group-hover:underline">{{ m.homeTeam }}</span>
              </div>
              <div class="px-3 font-bold tabular-nums text-lg shrink-0">
                <span v-if="m.fullTimeHome !== null">{{ m.fullTimeHome }}–{{ m.fullTimeAway }}</span>
                <span v-else class="text-sm font-normal" style="color: var(--p-text-muted-color)">vs</span>
              </div>
              <div class="flex items-center gap-2 flex-1 min-w-0 justify-end">
                <span class="truncate font-medium text-right group-hover:underline">{{ m.awayTeam }}</span>
                <img v-if="flagUrl(m.awayTeamCode)" :src="flagUrl(m.awayTeamCode) || ''" class="w-6 h-6 rounded object-cover" alt="" >
              </div>
            </NuxtLink>

            <div class="flex items-center justify-between text-xs" style="color: var(--p-text-muted-color)">
              <span>{{ fmtTime(m.kickoffTime) }}<template v-if="m.group"> · Grp {{ m.group }}</template></span>
              <Tag :value="matchStatusLabel(m.status)" :severity="statusSeverity(m.status)" />
            </div>

            <div class="flex items-center justify-between gap-2 pt-3 border-t" style="border-color: var(--p-content-border-color)">
              <ScoreInput
                :home="predByMatch[m.id]?.homeGoals ?? null"
                :away="predByMatch[m.id]?.awayGoals ?? null"
                :disabled="m.isLocked"
                @update="(v) => save(m.id, v)"
              />
              <div class="flex flex-col items-end gap-1">
                <Button
                  v-if="predByMatch[m.id]"
                  :label="predByMatch[m.id].isJoker ? '★ Joker' : 'Joker'"
                  :icon="predByMatch[m.id].isJoker ? 'pi pi-star-fill' : 'pi pi-star'"
                  :severity="predByMatch[m.id].isJoker ? 'warn' : 'secondary'"
                  :outlined="!predByMatch[m.id].isJoker"
                  size="small"
                  :disabled="m.isLocked"
                  @click="toggleJoker(predByMatch[m.id])"
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
