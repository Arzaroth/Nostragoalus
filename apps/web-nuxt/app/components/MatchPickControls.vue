<script setup lang="ts">
// The editable pick block for one match card: the exact-score input, an optional
// W/D/L quick-pick (easy/hardcore), and an optional HARD confidence stake. It
// stays presentational - the page owns where a save lands (base pick or league
// override).
const props = defineProps<{
  home: number | null
  away: number | null
  wager: number | null
  disabled?: boolean
  showQuickPick?: boolean
  showStake?: boolean
  homeCode?: string | null
  awayCode?: string | null
  budgetUsed?: number
  budgetTotal?: number
}>()
const emit = defineEmits<{
  save: [{ home: number; away: number; isOutcomeOnly: boolean }]
  saveStake: [number]
}>()

const { t } = useI18n()

function quick(outcome: 'HOME' | 'DRAW' | 'AWAY') {
  const s = outcome === 'HOME' ? { home: 1, away: 0 } : outcome === 'DRAW' ? { home: 1, away: 1 } : { home: 0, away: 1 }
  emit('save', { ...s, isOutcomeOnly: true })
}

const stake = ref(props.wager ?? 0)
const stakeEditing = ref(false)
// Don't clobber an in-progress edit when the query refetches (same guard idea as
// ScoreInput's `editing`).
watch(
  () => props.wager,
  (w) => {
    if (!stakeEditing.value) stake.value = w ?? 0
  },
)
// Cap the stepper at what the round budget still allows (plus this match's own
// current stake, which is already counted in budgetUsed).
const stakeMax = computed(() =>
  props.budgetTotal != null && props.budgetUsed != null
    ? Math.max(0, props.budgetTotal - props.budgetUsed + (props.wager ?? 0))
    : 99,
)
function commitStake() {
  stakeEditing.value = false
  if (stake.value !== (props.wager ?? 0)) emit('saveStake', stake.value)
}
</script>

<template>
  <div class="flex flex-col items-center gap-2 w-full">
    <div v-if="showQuickPick" class="flex items-center gap-1" @click.stop>
      <Button v-tooltip.top="t('leagues.quickHome')" size="small" severity="secondary" outlined :disabled="disabled" :label="homeCode || '1'" @click="quick('HOME')" />
      <Button v-tooltip.top="t('leagues.quickDraw')" size="small" severity="secondary" outlined :disabled="disabled" label="X" @click="quick('DRAW')" />
      <Button v-tooltip.top="t('leagues.quickAway')" size="small" severity="secondary" outlined :disabled="disabled" :label="awayCode || '2'" @click="quick('AWAY')" />
    </div>
    <ScoreInput :home="home" :away="away" :disabled="disabled" @update="(v) => emit('save', { ...v, isOutcomeOnly: false })" />
    <div v-if="showStake" class="flex items-center gap-2 text-xs" @click.stop>
      <span style="color: var(--p-text-muted-color)">{{ t('leagues.wagerLabel') }}</span>
      <InputNumber
        v-model="stake"
        :min="0"
        :max="stakeMax"
        :disabled="disabled"
        show-buttons
        button-layout="horizontal"
        size="small"
        input-class="w-10 text-center"
        @focus="stakeEditing = true"
        @blur="commitStake"
      />
      <span v-if="budgetTotal != null" style="color: var(--p-text-muted-color)">{{ t('leagues.wagerBudget', { used: budgetUsed ?? 0, total: budgetTotal }) }}</span>
    </div>
  </div>
</template>
