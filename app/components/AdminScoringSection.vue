<script setup lang="ts">
interface CrowdTier { maxShareExclusive: number; bonus: number }
interface OddsTier { minDecimalOdds: number; bonus: number }
interface ChampionTier { maxRank: number | null; points: number }
interface Rules {
  base: { exact: number; diff: number; outcome: number; miss: number }
  jokerMultiplier: number
  jokerAppliesToBonus: boolean
  championBonus: number
  championTiers: ChampionTier[]
  bestScorerBonus: number
  bonusSource: 'NONE' | 'CROWD' | 'ODDS'
  crowdTiers: CrowdTier[]
  crowdOutcomeTiers: CrowdTier[] | null
  crowdMatchBasis: 'EXACT' | 'OUTCOME'
  crowdMinDenominator: number
  oddsTiers: OddsTier[] | null
  oddsAppliesTo: 'EXACT' | 'OUTCOME'
}
interface Entry { competitionId: string | null; competition: { id: string; slug: string; name: string } | null; version: number; rules: Rules }
interface CompetitionRow { id: string; slug: string; name: string; hasOverride: boolean }

const props = defineProps<{ isAdmin: boolean }>()

const { t } = useI18n()

const { data, refresh, status: fetchStatus } = useFetch<{ entries: Entry[]; competitions: CompetitionRow[] }>(
  '/api/admin/scoring',
  { lazy: true, immediate: props.isAdmin },
)
const entries = computed(() => data.value?.entries ?? [])
const competitions = computed(() => data.value?.competitions ?? [])

const clone = (r: Rules): Rules => JSON.parse(JSON.stringify(r)) as Rules

// 'DEFAULT' or a competition slug.
const scope = ref<string>('DEFAULT')
const scopeOptions = computed(() => [
  { label: t('admin.scoring.defaultScope'), value: 'DEFAULT' },
  ...competitions.value.map((c) => ({ label: c.hasOverride ? `${c.name} ${t('admin.scoring.overrideBadge')}` : c.name, value: c.slug })),
])
const currentCompetition = computed(() => competitions.value.find((c) => c.slug === scope.value) ?? null)
const hasOverride = computed(() => scope.value !== 'DEFAULT' && !!currentCompetition.value?.hasOverride)
const defaultEntry = computed(() => entries.value.find((e) => e.competitionId === null) ?? null)

const form = ref<Rules | null>(null)

function loadScope() {
  if (scope.value === 'DEFAULT') {
    if (defaultEntry.value) form.value = clone(defaultEntry.value.rules)
    return
  }
  const override = entries.value.find((e) => e.competition?.slug === scope.value)
  // No override yet: seed the form from the default so the admin edits a copy.
  form.value = clone((override ?? defaultEntry.value)?.rules ?? null as unknown as Rules)
}
watch([scope, data], loadScope, { immediate: true })

const sourceOptions = computed(() => [
  { label: t('admin.scoring.sourceNone'), value: 'NONE' },
  { label: t('admin.scoring.sourceCrowd'), value: 'CROWD' },
  { label: t('admin.scoring.sourceOdds'), value: 'ODDS' },
])
const basisOptions = computed(() => [
  { label: t('admin.scoring.basisExact'), value: 'EXACT' },
  { label: t('admin.scoring.basisOutcome'), value: 'OUTCOME' },
])

const resultLayerEnabled = computed({
  get: () => !!form.value?.crowdOutcomeTiers,
  set: (on: boolean) => {
    if (!form.value) return
    form.value.crowdOutcomeTiers = on ? [{ maxShareExclusive: 0.1, bonus: 2 }, { maxShareExclusive: 0.25, bonus: 1 }] : null
  },
})
const oddsEnabled = computed({
  get: () => !!form.value?.oddsTiers,
  set: (on: boolean) => {
    if (!form.value) return
    form.value.oddsTiers = on ? [{ minDecimalOdds: 2.2, bonus: 2 }] : null
  },
})

function addCrowdTier(arr: CrowdTier[]) { arr.push({ maxShareExclusive: 0.3, bonus: 1 }) }
function addOddsTier(arr: OddsTier[]) { arr.push({ minDecimalOdds: 2, bonus: 1 }) }
function addChampionTier(arr: ChampionTier[]) { arr.push({ maxRank: 50, points: 10 }) }
function removeAt<T>(arr: T[], i: number) { arr.splice(i, 1) }

const saving = ref(false)
const err = ref('')
const msg = ref('')

async function save() {
  if (!form.value) return
  err.value = ''
  msg.value = ''
  saving.value = true
  try {
    const res = await $fetch<{ version: number; recomputed: number }>('/api/admin/scoring', {
      method: 'PUT',
      body: { competition: scope.value === 'DEFAULT' ? null : scope.value, rules: form.value },
    })
    msg.value = t('admin.scoring.saved', { count: res.recomputed })
    await refresh()
  } catch (e: unknown) {
    err.value = errorMessage(e) || t('admin.scoring.saveFailed')
  } finally {
    saving.value = false
  }
}

async function removeOverride() {
  if (scope.value === 'DEFAULT') return
  err.value = ''
  msg.value = ''
  saving.value = true
  try {
    const res = await $fetch<{ recomputed: number }>(`/api/admin/scoring/${encodeURIComponent(scope.value)}`, { method: 'DELETE' })
    msg.value = t('admin.scoring.removed', { count: res.recomputed })
    await refresh()
    loadScope()
  } catch (e: unknown) {
    err.value = errorMessage(e) || t('admin.scoring.saveFailed')
  } finally {
    saving.value = false
  }
}

function errorMessage(e: unknown): string {
  const data = (e as { data?: { statusMessage?: string; message?: string } })?.data
  return data?.statusMessage || data?.message || ''
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex justify-end">
      <Button :label="t('common.refresh')" icon="pi pi-refresh" size="small" severity="secondary" outlined :loading="fetchStatus === 'pending'" @click="() => refresh()" />
    </div>

    <template v-if="form">
      <section class="ng-card rounded-2xl border p-6 flex flex-col gap-4" style="background: var(--p-content-background)">
        <div class="flex flex-col gap-1 max-w-md">
          <label class="text-xs font-medium">{{ t('admin.scoring.scope') }}</label>
          <Select v-model="scope" :options="scopeOptions" option-label="label" option-value="value" class="w-full" />
          <span v-if="scope !== 'DEFAULT' && !hasOverride" class="text-xs" style="color: var(--p-text-muted-color)">{{ t('admin.scoring.inheritsDefault') }}</span>
        </div>
      </section>

      <!-- Base points -->
      <section class="ng-card rounded-2xl border p-6 flex flex-col gap-4" style="background: var(--p-content-background)">
        <h2 class="font-semibold">{{ t('admin.scoring.base') }}</h2>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label class="flex flex-col gap-1 text-xs font-medium">{{ t('admin.scoring.exact') }}<InputNumber v-model="form.base.exact" :min="0" :max="100" class="w-full" /></label>
          <label class="flex flex-col gap-1 text-xs font-medium">{{ t('admin.scoring.diff') }}<InputNumber v-model="form.base.diff" :min="0" :max="100" class="w-full" /></label>
          <label class="flex flex-col gap-1 text-xs font-medium">{{ t('admin.scoring.outcome') }}<InputNumber v-model="form.base.outcome" :min="0" :max="100" class="w-full" /></label>
          <label class="flex flex-col gap-1 text-xs font-medium">{{ t('admin.scoring.miss') }}<InputNumber v-model="form.base.miss" :min="0" :max="100" class="w-full" /></label>
        </div>
      </section>

      <!-- Joker -->
      <section class="ng-card rounded-2xl border p-6 flex flex-col gap-4" style="background: var(--p-content-background)">
        <h2 class="font-semibold">{{ t('admin.scoring.joker') }}</h2>
        <div class="flex flex-wrap items-center gap-6">
          <label class="flex flex-col gap-1 text-xs font-medium">{{ t('admin.scoring.jokerMultiplier') }}<InputNumber v-model="form.jokerMultiplier" :min="1" :max="99.99" :max-fraction-digits="2" :step="0.25" show-buttons class="w-40" /></label>
          <label class="flex items-center gap-2 text-sm"><ToggleSwitch v-model="form.jokerAppliesToBonus" /> {{ t('admin.scoring.jokerAppliesToBonus') }}</label>
        </div>
      </section>

      <!-- Bonus engine -->
      <section class="ng-card rounded-2xl border p-6 flex flex-col gap-4" style="background: var(--p-content-background)">
        <h2 class="font-semibold">{{ t('admin.scoring.bonusEngine') }}</h2>
        <div class="flex flex-col gap-1 max-w-xs">
          <label class="text-xs font-medium">{{ t('admin.scoring.source') }}</label>
          <Select v-model="form.bonusSource" :options="sourceOptions" option-label="label" option-value="value" class="w-full" />
        </div>

        <!-- Crowd -->
        <div v-if="form.bonusSource === 'CROWD'" class="flex flex-col gap-4 border-t pt-4" style="border-color: var(--p-content-border-color)">
          <div class="flex flex-wrap items-end gap-6">
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium">{{ t('admin.scoring.crowdBasis') }}</label>
              <SelectButton v-model="form.crowdMatchBasis" :options="basisOptions" option-label="label" option-value="value" :allow-empty="false" />
            </div>
            <label class="flex flex-col gap-1 text-xs font-medium">{{ t('admin.scoring.crowdMinDenominator') }}<InputNumber v-model="form.crowdMinDenominator" :min="0" :max="100000" class="w-32" /></label>
          </div>

          <div class="flex flex-col gap-2">
            <div class="text-xs font-semibold">{{ t('admin.scoring.crowdTiers') }}</div>
            <div v-for="(tier, i) in form.crowdTiers" :key="`ct${i}`" class="flex items-center gap-2">
              <span class="text-xs w-24" style="color: var(--p-text-muted-color)">{{ t('admin.scoring.maxShare') }}</span>
              <InputNumber v-model="tier.maxShareExclusive" :min="0" :max="1" :max-fraction-digits="3" :step="0.01" class="w-28" />
              <span class="text-xs w-16 text-right" style="color: var(--p-text-muted-color)">{{ t('admin.scoring.bonus') }}</span>
              <InputNumber v-model="tier.bonus" :min="0" :max="100" class="w-24" />
              <Button icon="pi pi-trash" rounded text severity="danger" size="small" :aria-label="t('common.remove')" @click="removeAt(form.crowdTiers, i)" />
            </div>
            <Button :label="t('admin.scoring.addTier')" icon="pi pi-plus" size="small" severity="secondary" outlined class="self-start" @click="addCrowdTier(form.crowdTiers)" />
          </div>

          <div class="flex flex-col gap-2 border-t pt-4" style="border-color: var(--p-content-border-color)">
            <label class="flex items-center gap-2 text-sm font-semibold"><ToggleSwitch v-model="resultLayerEnabled" /> {{ t('admin.scoring.resultLayer') }}</label>
            <p class="text-xs" style="color: var(--p-text-muted-color)">{{ t('admin.scoring.resultLayerHint') }}</p>
            <template v-if="form.crowdOutcomeTiers">
              <div v-for="(tier, i) in form.crowdOutcomeTiers" :key="`ot${i}`" class="flex items-center gap-2">
                <span class="text-xs w-24" style="color: var(--p-text-muted-color)">{{ t('admin.scoring.maxShare') }}</span>
                <InputNumber v-model="tier.maxShareExclusive" :min="0" :max="1" :max-fraction-digits="3" :step="0.01" class="w-28" />
                <span class="text-xs w-16 text-right" style="color: var(--p-text-muted-color)">{{ t('admin.scoring.bonus') }}</span>
                <InputNumber v-model="tier.bonus" :min="0" :max="100" class="w-24" />
                <Button icon="pi pi-trash" rounded text severity="danger" size="small" :aria-label="t('common.remove')" @click="removeAt(form.crowdOutcomeTiers, i)" />
              </div>
              <Button :label="t('admin.scoring.addTier')" icon="pi pi-plus" size="small" severity="secondary" outlined class="self-start" @click="addCrowdTier(form.crowdOutcomeTiers)" />
            </template>
          </div>
        </div>

        <!-- Odds -->
        <div v-else-if="form.bonusSource === 'ODDS'" class="flex flex-col gap-4 border-t pt-4" style="border-color: var(--p-content-border-color)">
          <div class="flex flex-col gap-1 max-w-xs">
            <label class="text-xs font-medium">{{ t('admin.scoring.oddsAppliesTo') }}</label>
            <SelectButton v-model="form.oddsAppliesTo" :options="basisOptions" option-label="label" option-value="value" :allow-empty="false" />
          </div>
          <label class="flex items-center gap-2 text-sm font-semibold"><ToggleSwitch v-model="oddsEnabled" /> {{ t('admin.scoring.oddsTiers') }}</label>
          <template v-if="form.oddsTiers">
            <div v-for="(tier, i) in form.oddsTiers" :key="`od${i}`" class="flex items-center gap-2">
              <span class="text-xs w-24" style="color: var(--p-text-muted-color)">{{ t('admin.scoring.minOdds') }}</span>
              <InputNumber v-model="tier.minDecimalOdds" :min="1" :max="1000" :max-fraction-digits="2" :step="0.1" class="w-28" />
              <span class="text-xs w-16 text-right" style="color: var(--p-text-muted-color)">{{ t('admin.scoring.bonus') }}</span>
              <InputNumber v-model="tier.bonus" :min="0" :max="100" class="w-24" />
              <Button icon="pi pi-trash" rounded text severity="danger" size="small" :aria-label="t('common.remove')" @click="removeAt(form.oddsTiers, i)" />
            </div>
            <Button :label="t('admin.scoring.addTier')" icon="pi pi-plus" size="small" severity="secondary" outlined class="self-start" @click="addOddsTier(form.oddsTiers)" />
          </template>
        </div>
      </section>

      <!-- Champion + best scorer -->
      <section class="ng-card rounded-2xl border p-6 flex flex-col gap-4" style="background: var(--p-content-background)">
        <h2 class="font-semibold">{{ t('admin.scoring.champion') }}</h2>
        <label class="flex flex-col gap-1 text-xs font-medium max-w-xs">{{ t('admin.scoring.championBonus') }}<InputNumber v-model="form.championBonus" :min="0" :max="1000" class="w-40" /></label>
        <div class="flex flex-col gap-2">
          <div class="text-xs font-semibold">{{ t('admin.scoring.championTiers') }}</div>
          <div v-for="(tier, i) in form.championTiers" :key="`ch${i}`" class="flex items-center gap-2">
            <span class="text-xs w-24" style="color: var(--p-text-muted-color)">{{ t('admin.scoring.maxRank') }}</span>
            <InputNumber v-if="tier.maxRank !== null" v-model="tier.maxRank" :min="1" :max="500" class="w-28" />
            <span v-else class="text-xs w-28" style="color: var(--p-text-muted-color)">{{ t('admin.scoring.catchAll') }}</span>
            <span class="text-xs w-16 text-right" style="color: var(--p-text-muted-color)">{{ t('admin.scoring.points') }}</span>
            <InputNumber v-model="tier.points" :min="0" :max="1000" class="w-24" />
            <Button icon="pi pi-trash" rounded text severity="danger" size="small" :aria-label="t('common.remove')" @click="removeAt(form.championTiers, i)" />
          </div>
          <Button :label="t('admin.scoring.addTier')" icon="pi pi-plus" size="small" severity="secondary" outlined class="self-start" @click="addChampionTier(form.championTiers)" />
        </div>
        <label class="flex flex-col gap-1 text-xs font-medium max-w-xs border-t pt-4" style="border-color: var(--p-content-border-color)">{{ t('admin.scoring.bestScorerBonus') }}<InputNumber v-model="form.bestScorerBonus" :min="0" :max="1000" class="w-40" /></label>
      </section>

      <!-- Actions -->
      <section class="ng-card rounded-2xl border p-6 flex flex-col gap-3" style="background: var(--p-content-background)">
        <Message v-if="err" severity="error" size="small">{{ err }}</Message>
        <Message v-if="msg" severity="success" size="small">{{ msg }}</Message>
        <p class="text-xs" style="color: var(--p-text-muted-color)">{{ t('admin.scoring.recomputeNote') }}</p>
        <div class="flex justify-end gap-2">
          <Button v-if="hasOverride" :label="t('admin.scoring.removeOverride')" icon="pi pi-times" severity="danger" outlined :loading="saving" @click="removeOverride" />
          <Button :label="t('admin.scoring.save')" icon="pi pi-save" :loading="saving" @click="save" />
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
/* PrimeVue's InputNumber inner input is a flex child that won't shrink below its
   content width, so the fixed widths on the roots (w-28 / w-24 / w-40) overflowed
   and crammed the tier rows (eating the bonus/points labels, overlapping the
   joker toggle). Let the input fill and shrink to the root's set width. */
:deep(.p-inputnumber) {
  min-width: 0;
}
:deep(.p-inputnumber-input) {
  width: 100%;
  min-width: 0;
}
</style>
