<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'

const { t } = useI18n()
const slug = useSelectedCompetition()
const { query, setPick } = useBestScorer()
const data = computed<any>(() => query.data.value)
const selectedTeamCode = ref<string | null>(null)
const selectedPlayerId = ref<string | null>(null)
const saving = setPick.isPending

watchEffect(() => {
  if (selectedTeamCode.value === null && data.value?.myPick) {
    selectedTeamCode.value = data.value.myPick.teamCode ?? null
    selectedPlayerId.value = data.value.myPick.playerId ?? null
  }
})

// Squads live behind the team endpoint - fetched per selected team, not all 48 at once.
const squadQuery = useQuery({
  queryKey: ['squad', slug, selectedTeamCode],
  enabled: computed(() => !!selectedTeamCode.value),
  queryFn: ({ signal }) =>
    $fetch<any>(`/api/teams/${selectedTeamCode.value}`, {
      query: slug.value ? { competition: slug.value } : {},
      signal,
    }),
})
const squad = computed<any[]>(() => squadQuery.data.value?.squad ?? [])

function onTeamChange() {
  selectedPlayerId.value = null
}
function teamName(code: string | null) {
  return data.value?.teams?.find((tm: { code: string; name: string }) => tm.code === code)?.name ?? code
}
function save() {
  const player = squad.value.find((p) => p.playerId === selectedPlayerId.value)
  if (player) {
    setPick.mutate({
      playerId: player.playerId,
      playerName: player.name,
      teamCode: selectedTeamCode.value,
      teamName: teamName(selectedTeamCode.value) ?? '',
    })
  }
}

// What the showcase displays: the live selection (preview) or the saved pick.
const showcase = computed(() => {
  if (!data.value?.locked) {
    const player = squad.value.find((p) => p.playerId === selectedPlayerId.value)
    if (player) return { playerId: player.playerId, playerName: player.name, teamCode: selectedTeamCode.value }
  }
  return data.value?.myPick ?? null
})
const isSaved = computed(() => !!data.value?.myPick && showcase.value?.playerId === data.value.myPick.playerId)

// FIFA has no headshot for every player - fall back to the team flag on 404.
const photoFailed = ref(false)
watch(() => showcase.value?.playerId, () => {
  photoFailed.value = false
})
const photoSrc = computed(() => (photoFailed.value ? null : playerPhotoUrl(showcase.value?.playerId)))
</script>

<template>
  <div v-if="data && data.competition" class="ng-card rounded-2xl border p-5 mb-6" style="background: var(--p-content-background)">
    <div class="flex flex-col sm:flex-row sm:items-center gap-6">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 font-semibold text-lg mb-1"><span class="text-2xl">👟</span> {{ t('bestScorer.title') }}</div>
        <p class="text-sm mb-4" style="color: var(--p-text-muted-color)">{{ t('bestScorer.hint') }}</p>

        <template v-if="data.locked">
          <span v-if="!data.myPick" style="color: var(--p-text-muted-color)">{{ t('bestScorer.noPick') }}</span>
          <span v-else class="inline-flex items-center gap-2 text-sm" style="color: var(--p-text-muted-color)">
            <i class="pi pi-lock text-xs" /> {{ t('bestScorer.lockedIn') }}
          </span>
        </template>

        <template v-else>
          <div class="flex flex-wrap items-center gap-3">
            <Select
              v-model="selectedTeamCode"
              :options="data.teams"
              option-label="name"
              option-value="code"
              filter
              :placeholder="t('bestScorer.pickTeam')"
              class="w-full sm:w-56"
              @change="onTeamChange"
            >
              <template #value="{ value, placeholder }">
                <span v-if="value" class="flex items-center gap-2">
                  <img v-if="flagUrl(value)" :src="flagUrl(value) || ''" class="w-5 h-5 rounded object-cover" alt="" >
                  {{ teamName(value) }}
                </span>
                <span v-else>{{ placeholder }}</span>
              </template>
              <template #option="{ option }">
                <span class="flex items-center gap-2">
                  <img v-if="flagUrl(option.code)" :src="flagUrl(option.code) || ''" class="w-5 h-5 rounded object-cover" alt="" >
                  {{ option.name }}
                </span>
              </template>
            </Select>
            <Select
              v-model="selectedPlayerId"
              :options="squad"
              option-label="name"
              option-value="playerId"
              filter
              :disabled="!selectedTeamCode"
              :loading="squadQuery.isFetching.value"
              :placeholder="t('bestScorer.pickPlayer')"
              class="w-full sm:w-64"
            >
              <template #option="{ option }">
                <span class="flex items-center gap-2">
                  <span class="w-6 text-right tabular-nums" style="color: var(--p-text-muted-color)">{{ option.shirtNumber ?? '–' }}</span>
                  {{ formatPlayerName(option.name) }}
                  <span v-if="option.position" class="text-xs" style="color: var(--p-text-muted-color)">{{ option.position }}</span>
                </span>
              </template>
            </Select>
            <Button
              :label="t('common.save')"
              icon="pi pi-check"
              :disabled="!selectedPlayerId || selectedPlayerId === data.myPick?.playerId"
              :loading="saving"
              @click="save"
            />
          </div>
        </template>
      </div>

      <!-- Golden boot showcase -->
      <div class="shrink-0 flex flex-col items-center gap-2 self-center sm:pr-8">
        <div class="relative mt-3">
          <template v-if="showcase">
            <div
              class="absolute -inset-5 rounded-full blur-xl pointer-events-none"
              style="background: radial-gradient(circle, rgba(245, 179, 1, 0.4), transparent 70%)"
            />
            <span
              class="absolute -top-4 -left-4 text-3xl z-10 select-none"
              style="transform: rotate(-25deg); filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35))"
            >👟</span>
            <img
              v-if="photoSrc"
              :src="photoSrc"
              class="relative w-20 h-20 rounded-2xl object-cover"
              style="box-shadow: 0 0 0 3px rgba(245, 179, 1, 0.6), 0 10px 24px rgba(0, 0, 0, 0.3)"
              alt=""
              @error="photoFailed = true"
            >
            <img
              v-else-if="flagUrl(showcase.teamCode)"
              :src="flagUrl(showcase.teamCode) || ''"
              class="relative w-20 h-20 rounded-2xl object-cover"
              style="box-shadow: 0 0 0 3px rgba(245, 179, 1, 0.6), 0 10px 24px rgba(0, 0, 0, 0.3)"
              alt=""
            >
          </template>
          <template v-else>
            <span class="absolute -top-4 -left-4 text-3xl z-10 opacity-30 grayscale select-none" style="transform: rotate(-25deg)">👟</span>
            <div
              class="w-20 h-20 rounded-2xl border-2 border-dashed flex items-center justify-center text-2xl"
              style="border-color: var(--p-content-border-color); color: var(--p-text-muted-color)"
            >?</div>
          </template>
        </div>
        <div class="text-center">
          <strong v-if="showcase" class="block leading-tight">{{ formatPlayerName(showcase.playerName) }}</strong>
          <span v-else class="block text-sm leading-tight" style="color: var(--p-text-muted-color)">{{ t('bestScorer.pickPlayer') }}</span>
          <!-- one reserved line: points / preview hint / invisible spacer - the card never resizes -->
          <span v-if="isSaved && data.myPick?.awardedPoints > 0" class="text-xs block mt-0.5 font-bold" style="color: var(--ng-success)">+{{ data.myPick.awardedPoints }} pts</span>
          <span
            v-else
            class="text-xs block mt-0.5"
            :class="{ invisible: !(showcase && !isSaved && !data.locked) }"
            style="color: var(--p-text-muted-color)"
          >{{ t('bestScorer.preview') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
