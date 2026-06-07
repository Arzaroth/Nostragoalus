<script setup lang="ts">
const { t } = useI18n()
const slug = useSelectedCompetition()
const global = ref(false)
const { data: rows, isLoading } = useLeaderboard(global)
const { session } = useAuth()
const meId = computed(() => session?.data?.user?.id)

const scopeOptions = computed(() => [
  { label: t('leaderboard.thisCompetition'), value: false },
  { label: t('leaderboard.global'), value: true },
])

function medal(rank: number) {
  return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-3 flex-wrap mb-5">
      <div class="flex items-center gap-3 flex-wrap">
        <h1 class="text-2xl font-bold">{{ t('leaderboard.title') }}</h1>
        <CompetitionPill />
      </div>
      <SelectButton v-model="global" :options="scopeOptions" option-label="label" option-value="value" :allow-empty="false" size="small" />
    </div>
    <div v-if="isLoading" class="opacity-60">{{ t('common.loading') }}</div>
    <div v-else-if="!rows || !rows.length" class="opacity-60">{{ t('leaderboard.empty') }}</div>

    <div v-else class="flex flex-col gap-2">
      <NuxtLink
        v-for="r in rows"
        :key="r.userId"
        :to="`/${slug}/users/${r.userId}`"
        class="ng-card flex items-center gap-3 rounded-xl border px-4 py-3"
        :style="`background: var(--p-content-background); border-color: ${r.userId === meId ? 'var(--p-primary-color)' : 'var(--p-content-border-color)'}; border-width: ${r.userId === meId ? '2px' : '1px'}`"
      >
        <div class="w-8 text-center shrink-0">
          <div class="font-bold tabular-nums text-lg leading-tight">
            <span v-if="medal(r.rank)">{{ medal(r.rank) }}</span>
            <span v-else style="color: var(--p-text-muted-color)">{{ r.rank }}</span>
          </div>
          <div v-if="r.movement" class="text-[10px] font-bold leading-none" :style="`color: ${r.movement > 0 ? '#22c55e' : '#ef4444'}`">
            {{ r.movement > 0 ? '▲' : '▼' }}{{ Math.abs(r.movement) }}
          </div>
        </div>
        <Avatar
          :label="(r.displayName || '?').charAt(0).toUpperCase()"
          shape="circle"
          class="!bg-[var(--p-primary-color)] !text-[var(--p-primary-contrast-color)] font-bold shrink-0"
        />
        <div class="flex-1 min-w-0">
          <div class="font-semibold truncate">
            {{ r.displayName }}
            <span v-if="r.userId === meId" class="text-xs font-normal" style="color: var(--p-primary-color)">{{ t('leaderboard.you') }}</span>
          </div>
          <div class="text-xs" style="color: var(--p-text-muted-color)">{{ r.exactCount }} {{ t('leaderboard.exact') }} · {{ r.outcomeCount }} {{ t('leaderboard.correct') }}</div>
        </div>
        <div class="text-right shrink-0">
          <span class="text-xl font-bold tabular-nums">{{ r.totalPoints }}</span>
          <span class="text-xs ml-1" style="color: var(--p-text-muted-color)">{{ t('leaderboard.pts') }}</span>
        </div>
        <i class="pi pi-angle-right text-xs shrink-0" style="color: var(--p-text-muted-color)" />
      </NuxtLink>
    </div>
  </div>
</template>
