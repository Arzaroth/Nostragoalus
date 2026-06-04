<script setup lang="ts">
const { data: matches, isLoading } = useMatches()
const { data: predictions } = useMyPredictions()
const { upsert, setJoker } = usePredictionMutations()

const predByMatch = computed(() => {
  const map: Record<string, MyPrediction> = {}
  for (const p of predictions.value ?? []) map[p.matchId] = p
  return map
})

function save(matchId: string, value: { home: number; away: number }) {
  upsert.mutate({ matchId, ...value })
}

function toggleJoker(pred: MyPrediction) {
  setJoker.mutate({ matchId: pred.matchId, isJoker: !pred.isJoker })
}
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold mb-4">Fixtures</h1>
    <div v-if="isLoading" class="opacity-70">Loading fixtures…</div>
    <div v-else-if="!matches?.length" class="opacity-70">No fixtures yet — import them from the admin page.</div>
    <div v-else class="flex flex-col gap-3">
      <Card v-for="m in matches" :key="m.id">
        <template #content>
          <div class="flex items-center gap-4 flex-wrap">
            <div class="flex flex-col gap-1 text-sm opacity-80" style="width: 12rem">
              <span>{{ m.roundLabel }}<template v-if="m.group"> · Group {{ m.group }}</template></span>
              <span>{{ new Date(m.kickoffTime).toLocaleString() }}</span>
              <Tag :value="matchStatusLabel(m.status)" :severity="statusSeverity(m.status)" />
            </div>

            <div class="flex-1 font-medium min-w-48">
              {{ m.homeTeam }} <span class="opacity-50">vs</span> {{ m.awayTeam }}
              <span v-if="m.fullTimeHome !== null" class="ml-2 font-bold">
                {{ m.fullTimeHome }}–{{ m.fullTimeAway }}
              </span>
            </div>

            <div class="flex flex-col gap-1 items-end">
              <ScoreInput
                :home="predByMatch[m.id]?.homeGoals ?? null"
                :away="predByMatch[m.id]?.awayGoals ?? null"
                :disabled="m.isLocked"
                @update="(v) => save(m.id, v)"
              />
              <div v-if="predByMatch[m.id]?.totalPoints != null" class="text-sm">
                {{ tierLabel(predByMatch[m.id].baseTier) }} ·
                <strong>{{ predByMatch[m.id].totalPoints }} pts</strong>
              </div>
              <Button
                v-if="!m.isLocked && predByMatch[m.id]"
                :label="predByMatch[m.id].isJoker ? '★ Joker active' : '☆ Play joker'"
                size="small"
                text
                @click="toggleJoker(predByMatch[m.id])"
              />
            </div>
          </div>
        </template>
      </Card>
    </div>
  </div>
</template>
