<script setup lang="ts">
import type { TopScorer } from '#shared/types/match'

const props = withDefaults(
  defineProps<{ rows: TopScorer[]; metric: 'goals' | 'assists'; limit?: number }>(),
  { limit: 15 },
)
const { t } = useI18n()

// The endpoint sorts by goals; for the assist board we re-rank the same set by
// assists and drop zero rows so it isn't padded with players who never assisted.
// Ties break on the other metric then name, matching the endpoint's own order.
const ranked = computed(() =>
  props.rows
    .map((r) => ({
      row: r,
      flag: flagUrl(r.teamCode),
      value: props.metric === 'goals' ? r.goals ?? 0 : r.assists ?? 0,
      tiebreak: props.metric === 'goals' ? r.assists ?? 0 : r.goals ?? 0,
    }))
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value || b.tiebreak - a.tiebreak || a.row.playerName.localeCompare(b.row.playerName))
    .slice(0, props.limit),
)
</script>

<template>
  <table class="w-full text-sm">
    <thead>
      <tr style="color: var(--p-text-muted-color)">
        <th class="py-1 text-left">#</th>
        <th class="text-left">{{ t('stats.player') }}</th>
        <th class="text-center">{{ metric === 'goals' ? '⚽' : '👟' }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-if="!ranked.length">
        <td colspan="3" class="py-3 text-center" style="color: var(--p-text-muted-color)">{{ t('stats.empty') }}</td>
      </tr>
      <tr
        v-for="(e, i) in ranked"
        :key="`${e.row.playerName}-${e.row.teamCode ?? ''}`"
        class="border-t"
        style="border-color: var(--p-content-border-color)"
      >
        <td class="py-2 text-left tabular-nums" style="color: var(--p-text-muted-color)">{{ i + 1 }}</td>
        <td class="text-left">
          <span class="flex items-center gap-2">
            <img v-if="e.flag" :src="e.flag || ''" class="w-5 h-5 rounded" alt="" >
            <span class="truncate">{{ formatPlayerName(e.row.playerName) }}</span>
          </span>
        </td>
        <td class="text-center font-bold tabular-nums">{{ e.value }}</td>
      </tr>
    </tbody>
  </table>
</template>
