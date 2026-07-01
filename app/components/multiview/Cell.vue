<script setup lang="ts">
import type { MatchListItem } from '../../composables/useMatches'

defineProps<{ matchId: string; match?: MatchListItem; focused?: boolean }>()
defineEmits<{ change: []; remove: []; focus: [] }>()
const { t } = useI18n()
</script>

<template>
  <div
    class="relative flex flex-col rounded-xl border overflow-hidden cursor-pointer transition"
    :style="`border-color: ${focused ? 'var(--p-primary-color)' : 'var(--p-content-border-color)'}; background: var(--p-content-background); ${focused ? 'box-shadow: 0 0 0 1px var(--p-primary-color)' : ''}`"
    @click="$emit('focus')"
  >
    <div class="flex items-center justify-between gap-2 px-2 py-1.5 border-b" style="border-color: var(--p-content-border-color)">
      <span class="flex items-center gap-1.5 min-w-0 text-sm font-medium">
        <template v-if="match">
          <img v-if="flagUrl(match.homeTeamCode)" :src="flagUrl(match.homeTeamCode) || ''" class="w-4 h-4 rounded object-cover shrink-0" alt="" >
          <span class="truncate">{{ match.homeTeam }}</span>
          <span class="opacity-50 shrink-0">-</span>
          <span class="truncate">{{ match.awayTeam }}</span>
          <img v-if="flagUrl(match.awayTeamCode)" :src="flagUrl(match.awayTeamCode) || ''" class="w-4 h-4 rounded object-cover shrink-0" alt="" >
        </template>
        <span v-else class="truncate opacity-60">{{ t('matches.noResults') }}</span>
      </span>
      <span class="flex items-center gap-1 shrink-0" @click.stop>
        <button type="button" class="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10" :aria-label="t('multiview.changeMatch')" v-tooltip.bottom="t('multiview.changeMatch')" @click="$emit('change')">
          <i class="pi pi-sync text-xs" />
        </button>
        <button type="button" class="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10" :aria-label="t('multiview.remove')" v-tooltip.bottom="t('multiview.remove')" @click="$emit('remove')">
          <i class="pi pi-times text-xs" />
        </button>
      </span>
    </div>
    <div class="flex-1 min-h-0 p-2">
      <MultiviewCellTile :match-id="matchId" :match="match" :focused="focused" />
    </div>
  </div>
</template>
