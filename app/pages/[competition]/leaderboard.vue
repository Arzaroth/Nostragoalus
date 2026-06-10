<script setup lang="ts">
const { t } = useI18n()
const slug = useSelectedCompetition()
const { league, leagueId } = useSelectedLeague()

// Three scopes once a league is picked in the pill; the pill decides WHICH
// league, this toggle decides how wide the ranking is.
const scope = ref<'league' | 'competition' | 'global'>(leagueId.value ? 'league' : 'competition')
watch(leagueId, (id) => {
  if (id) scope.value = 'league'
  else if (scope.value === 'league') scope.value = 'competition'
})

const isGlobal = computed(() => scope.value === 'global')
const scopedLeagueId = computed(() => (scope.value === 'league' ? leagueId.value : null))
const { data: rows, isLoading } = useLeaderboard(isGlobal, scopedLeagueId)
const { session } = useAuth()
const meId = computed(() => session.value?.data?.user?.id)

const scopeOptions = computed(() => [
  ...(league.value ? [{ label: league.value.name, value: 'league' as const }] : []),
  { label: t('leaderboard.thisCompetition'), value: 'competition' as const },
  { label: t('leaderboard.global'), value: 'global' as const },
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
        <LeaguePill />
      </div>
      <SelectButton v-model="scope" :options="scopeOptions" option-label="label" option-value="value" :allow-empty="false" size="small" />
    </div>
    <div v-if="isLoading" class="opacity-60">{{ t('common.loading') }}</div>
    <div v-else-if="!rows || !rows.length" class="opacity-60">{{ t('leaderboard.empty') }}</div>

    <div v-else class="flex flex-col gap-2">
      <NuxtLink
        v-for="r in rows"
        :key="r.userId"
        :to="`/${slug}/users/${r.userId}${isGlobal ? '?global=1' : ''}`"
        class="ng-card flex items-center gap-3 rounded-xl border px-4 py-3"
        :style="`background: var(--p-content-background); border-color: ${r.userId === meId ? 'var(--p-primary-color)' : 'var(--p-content-border-color)'}; border-width: ${r.userId === meId ? '2px' : '1px'}`"
      >
        <div class="w-8 text-center shrink-0">
          <div class="font-bold tabular-nums text-lg leading-tight">
            <span v-if="medal(r.rank)">{{ medal(r.rank) }}</span>
            <span v-else style="color: var(--p-text-muted-color)">{{ r.rank }}</span>
          </div>
          <div v-if="r.movement" class="text-[10px] font-bold leading-none" :style="`color: ${r.movement > 0 ? 'var(--ng-success)' : 'var(--ng-danger)'}`">
            {{ r.movement > 0 ? '▲' : '▼' }}{{ Math.abs(r.movement) }}
          </div>
        </div>
        <Avatar :image="r.image || '/brand/avatar.svg'" shape="circle" class="shrink-0 overflow-hidden" />
        <div class="flex-1 min-w-0">
          <div class="font-semibold truncate flex items-center gap-2.5">
            <span class="truncate">{{ r.displayName }}</span>
            <span v-if="r.championCode && flagUrl(r.championCode)" class="relative shrink-0 inline-flex" :title="`${t('champion.title')}: ${r.championCode}`">
              <img :src="flagUrl(r.championCode) || ''" class="w-4 h-4 rounded object-cover" alt="" >
              <span class="absolute -top-2 -left-1.5 text-[10px]" style="transform: rotate(-25deg)">👑</span>
            </span>
            <span v-if="r.userId === meId" class="text-xs font-normal" style="color: var(--p-primary-color)">{{ t('leaderboard.you') }}</span>
          </div>
          <div class="text-xs" style="color: var(--p-text-muted-color)">
            {{ r.exactCount }} {{ t('leaderboard.exact') }} · {{ r.outcomeCount }} {{ t('leaderboard.correct') }}<template v-if="r.championPoints"> · 👑 +{{ r.championPoints }}</template>
          </div>
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
