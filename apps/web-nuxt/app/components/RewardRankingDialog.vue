<script setup lang="ts">
import type { LeagueRewardCriterion, RewardMetric } from '#shared/types/rewards'

const props = defineProps<{ leagueId: string | null; type: LeagueRewardCriterion | null; teamCode?: string | null }>()
const visible = defineModel<boolean>('visible', { required: true })
const { t } = useI18n()
const criterionName = useCriterionName()

const ranking = useRewardRanking(
  () => props.leagueId,
  () => props.type,
  visible,
)

const heading = computed(() =>
  props.type ? criterionName(props.type, props.teamCode ?? ranking.data.value?.teamCode ?? null) : '',
)
const rows = computed(() => ranking.data.value?.rows ?? [])
const metric = computed<RewardMetric>(() => ranking.data.value?.metric ?? 'points')

// The unit shown after each member's value, per the criterion's ranking metric.
const METRIC_LABEL: Record<RewardMetric, string> = {
  points: 'reward.metricPoints',
  exact: 'reward.metricExact',
  outcome: 'reward.metricOutcome',
  goaldiff: 'reward.metricGoalDiff',
}

// A concealed member (private/hidden) comes back with a blank name.
function nameOf(displayName: string): string {
  return displayName === '' ? t('reward.hiddenLeader') : displayName
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="heading" class="w-[95vw] max-w-md">
    <div v-if="ranking.data.value?.reward" class="flex items-center gap-3 mb-3 pb-3 border-b" style="border-color: var(--p-content-border-color)">
      <img v-if="ranking.data.value.reward.imageUrl" :src="ranking.data.value.reward.imageUrl" class="w-12 h-12 rounded object-cover shrink-0" alt="" >
      <i v-else class="pi pi-gift text-xl shrink-0" style="color: var(--p-primary-color)" />
      <div class="min-w-0">
        <div class="font-semibold leading-tight">{{ ranking.data.value.reward.label }}</div>
        <a v-if="ranking.data.value.reward.link" :href="ranking.data.value.reward.link" target="_blank" rel="noopener" class="text-xs hover:underline" style="color: var(--p-primary-color)">{{ t('reward.details') }}</a>
      </div>
    </div>

    <div v-if="ranking.isLoading.value" class="text-sm" style="color: var(--p-text-muted-color)">{{ t('common.loading') }}</div>
    <p v-else-if="rows.length === 0" class="text-sm" style="color: var(--p-text-muted-color)">{{ t('reward.noRanking') }}</p>
    <ol v-else class="flex flex-col gap-1">
      <li
        v-for="r in rows"
        :key="r.userId"
        class="flex items-center gap-3 rounded-md px-2 py-1.5"
        :style="r.isViewer ? 'background: var(--p-highlight-background)' : ''"
      >
        <span class="w-6 text-right text-sm font-semibold tabular-nums shrink-0" style="color: var(--p-text-muted-color)">{{ r.rank }}</span>
        <!-- Concealed members (blank name) get no presence dot: userId drives it. -->
        <UserAvatar :image="r.image" :user-id="r.displayName === '' ? null : r.userId" />
        <span class="flex-1 min-w-0 truncate text-sm" :class="r.displayName === '' ? 'italic' : ''">
          {{ nameOf(r.displayName) }}
          <span v-if="r.isViewer" class="font-semibold" style="color: var(--p-primary-color)"> - {{ t('reward.you') }}</span>
        </span>
        <span class="text-sm font-semibold tabular-nums shrink-0">
          {{ r.value }}
          <span class="text-xs font-normal" style="color: var(--p-text-muted-color)">{{ t(METRIC_LABEL[metric]) }}</span>
        </span>
      </li>
    </ol>
  </Dialog>
</template>
