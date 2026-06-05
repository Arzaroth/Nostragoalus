<script setup lang="ts">
const route = useRoute()
const { data, refresh } = await useFetch<{
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
    group: string | null
    roundLabel: string
  }
  isLocked: boolean
}>(`/api/matches/${route.params.id}`)

const m = computed(() => data.value?.match)
</script>

<template>
  <div v-if="m" class="flex flex-col gap-6">
    <NuxtLink to="/matches" class="text-sm inline-flex items-center gap-1" style="color: var(--p-text-muted-color)">
      <i class="pi pi-arrow-left" /> Back to fixtures
    </NuxtLink>

    <div class="rounded-2xl border p-6" style="background: var(--p-content-background); border-color: var(--p-content-border-color)">
      <div class="flex items-center justify-between text-xs mb-4" style="color: var(--p-text-muted-color)">
        <span>{{ m.roundLabel }}<template v-if="m.group"> · Group {{ m.group }}</template></span>
        <Tag :value="matchStatusLabel(m.status)" :severity="statusSeverity(m.status)" />
      </div>

      <div class="flex items-center justify-around gap-4">
        <div class="flex flex-col items-center gap-2 flex-1">
          <img v-if="flagUrl(m.homeTeamCode)" :src="flagUrl(m.homeTeamCode) || ''" class="w-16 h-16 rounded-lg object-cover" alt="" >
          <span class="font-bold text-center">{{ m.homeTeam }}</span>
        </div>
        <div class="text-center">
          <div v-if="m.fullTimeHome !== null" class="text-4xl font-extrabold tabular-nums">{{ m.fullTimeHome }}–{{ m.fullTimeAway }}</div>
          <div v-else class="text-sm" style="color: var(--p-text-muted-color)">
            {{ new Date(m.kickoffTime).toLocaleString() }}
          </div>
        </div>
        <div class="flex flex-col items-center gap-2 flex-1">
          <img v-if="flagUrl(m.awayTeamCode)" :src="flagUrl(m.awayTeamCode) || ''" class="w-16 h-16 rounded-lg object-cover" alt="" >
          <span class="font-bold text-center">{{ m.awayTeam }}</span>
        </div>
      </div>
    </div>

    <div class="rounded-2xl border p-6 text-center" style="background: var(--p-content-background); border-color: var(--p-content-border-color); color: var(--p-text-muted-color)">
      <i class="pi pi-chart-bar text-2xl mb-2" />
      <p>Standings, head-to-head, form and top scorers are coming to this view.</p>
      <Button class="mt-3" label="Refresh" icon="pi pi-refresh" size="small" text @click="() => refresh()" />
    </div>
  </div>
  <div v-else class="opacity-60">Match not found.</div>
</template>
