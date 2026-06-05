<script setup lang="ts">
defineProps<{ predictions: MyPrediction[] }>()

function fmt(d: string) {
  return new Date(d).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div
      v-for="p in predictions"
      :key="p.id"
      class="ng-card rounded-2xl border p-4"
      style="background: var(--p-content-background)"
    >
      <div class="flex items-center justify-between text-xs mb-2" style="color: var(--p-text-muted-color)">
        <span>{{ p.roundLabel }} · {{ fmt(p.kickoffTime) }}</span>
        <span v-if="p.isJoker" class="font-semibold" style="color: #f59e0b">★ Joker</span>
      </div>

      <div class="flex items-center gap-3">
        <div class="flex items-center gap-2 flex-1 min-w-0 justify-end">
          <span class="truncate font-medium text-right">{{ p.homeTeam }}</span>
          <img v-if="flagUrl(p.homeTeamCode)" :src="flagUrl(p.homeTeamCode) || ''" class="w-6 h-6 rounded object-cover" alt="" >
        </div>
        <div class="text-center shrink-0 px-2">
          <div class="font-bold tabular-nums text-lg">{{ p.homeGoals }}–{{ p.awayGoals }}</div>
          <div v-if="p.fullTimeHome !== null" class="text-xs" style="color: var(--p-text-muted-color)">
            {{ p.fullTimeHome }}–{{ p.fullTimeAway }}
          </div>
        </div>
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <img v-if="flagUrl(p.awayTeamCode)" :src="flagUrl(p.awayTeamCode) || ''" class="w-6 h-6 rounded object-cover" alt="" >
          <span class="truncate font-medium">{{ p.awayTeam }}</span>
        </div>
      </div>

      <div v-if="p.totalPoints !== null" class="flex items-center justify-center gap-2 mt-3 text-xs">
        <Tag :value="tierLabel(p.baseTier)" :severity="p.totalPoints > 0 ? 'success' : 'secondary'" />
        <span class="font-semibold" style="color: var(--p-primary-color)">+{{ p.totalPoints }} pts</span>
      </div>
    </div>
  </div>
</template>
