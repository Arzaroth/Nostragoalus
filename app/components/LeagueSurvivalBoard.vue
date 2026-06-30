<script setup lang="ts">
import type { SurvivalRow } from '../composables/useLeagues'

const props = defineProps<{ rows: SurvivalRow[]; slug: string; meId?: string }>()
const { t } = useI18n()

function medal(rank: number) {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <NuxtLink
      v-for="r in props.rows"
      :key="r.userId"
      :to="`/${props.slug}/users/${r.userId}`"
      class="ng-card flex items-center gap-3 rounded-xl border px-4 py-3"
      :class="{ 'opacity-60': !r.alive }"
      :style="`background: var(--p-content-background); border-color: ${r.userId === props.meId ? 'var(--p-primary-color)' : 'var(--p-content-border-color)'}; border-width: ${r.userId === props.meId ? '2px' : '1px'}`"
    >
      <div class="w-8 text-center shrink-0 font-bold tabular-nums text-lg">
        <span v-if="r.alive && medal(r.rank)">{{ medal(r.rank) }}</span>
        <span v-else style="color: var(--p-text-muted-color)">{{ r.rank }}</span>
      </div>
      <UserAvatar :image="r.image" :user-id="r.userId" />
      <div class="flex-1 min-w-0">
        <div class="font-semibold truncate">
          {{ r.displayName }}
          <span v-if="r.userId === props.meId" class="text-xs font-normal ml-1" style="color: var(--p-primary-color)">{{ t('leaderboard.you') }}</span>
        </div>
        <div class="text-xs" style="color: var(--p-text-muted-color)">
          <template v-if="r.alive">{{ t('leagues.survivalLivesLeft', { n: r.livesLeft }, r.livesLeft) }}</template>
          <template v-else>{{ t('leagues.survivalEliminatedAt', { round: r.eliminatedRoundLabel ?? '' }) }}</template>
          · {{ t('leagues.survivalSurvived', { n: r.survived }) }}
        </div>
      </div>
      <div class="text-right shrink-0">
        <Tag
          :value="r.alive ? t('leagues.survivalAlive') : t('leagues.survivalOut')"
          :severity="r.alive ? 'success' : 'danger'"
        />
      </div>
    </NuxtLink>
  </div>
</template>
