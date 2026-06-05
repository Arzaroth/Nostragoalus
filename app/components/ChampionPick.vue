<script setup lang="ts">
const { t } = useI18n()
const { query, setPick } = useChampion()
const data = computed<any>(() => query.data.value)
const selectedCode = ref<string | null>(null)
const saving = setPick.isPending

watchEffect(() => {
  selectedCode.value = data.value?.myPick?.teamCode ?? null
})

function teamName(code: string | null) {
  return data.value?.teams?.find((tm: ChampionTeam) => tm.code === code)?.name ?? code
}
function save() {
  const team = data.value?.teams?.find((tm: ChampionTeam) => tm.code === selectedCode.value)
  if (team) setPick.mutate(team)
}
</script>

<template>
  <div v-if="data && data.competition" class="ng-card rounded-2xl border p-5 mb-6" style="background: var(--p-content-background)">
    <div class="flex items-center gap-2 font-semibold text-lg mb-1"><span class="text-2xl">🏆</span> {{ t('champion.title') }}</div>
    <p class="text-sm mb-4" style="color: var(--p-text-muted-color)">{{ t('champion.hint') }}</p>

    <template v-if="data.locked">
      <div v-if="data.myPick" class="flex items-center gap-3 rounded-xl border p-3" style="border-color: var(--p-content-border-color)">
        <img v-if="flagUrl(data.myPick.teamCode)" :src="flagUrl(data.myPick.teamCode) || ''" class="w-9 h-9 rounded object-cover" alt="" >
        <strong class="text-lg flex-1">{{ data.myPick.teamName }}</strong>
        <Tag v-if="data.myPick.awardedPoints > 0" :value="`+${data.myPick.awardedPoints} pts`" severity="success" />
      </div>
      <span v-else style="color: var(--p-text-muted-color)">{{ t('champion.noPick') }}</span>
    </template>

    <template v-else>
      <div class="flex flex-wrap items-center gap-3">
        <Select
          v-model="selectedCode"
          :options="data.teams"
          option-label="name"
          option-value="code"
          filter
          :placeholder="t('champion.pick')"
          class="w-full sm:w-80"
        >
          <template #value="{ value, placeholder }">
            <span v-if="value" class="flex items-center gap-2">
              <img v-if="flagUrl(value)" :src="flagUrl(value) || ''" class="w-5 h-5 rounded object-cover" alt="" >
              {{ teamName(value) }}
            </span>
            <span v-else>{{ placeholder }}</span>
          </template>
          <template #option="{ option }">
            <span class="flex items-center gap-2">
              <img v-if="flagUrl(option.code)" :src="flagUrl(option.code) || ''" class="w-5 h-5 rounded object-cover" alt="" >
              {{ option.name }}
            </span>
          </template>
        </Select>
        <Button
          :label="t('common.save')"
          icon="pi pi-check"
          :disabled="!selectedCode || selectedCode === data.myPick?.teamCode"
          :loading="saving"
          @click="save"
        />
      </div>
      <div v-if="data.myPick" class="flex items-center gap-2 mt-3 text-sm" style="color: var(--p-text-muted-color)">
        {{ t('champion.current') }}
        <img v-if="flagUrl(data.myPick.teamCode)" :src="flagUrl(data.myPick.teamCode) || ''" class="w-5 h-5 rounded object-cover" alt="" >
        <strong>{{ data.myPick.teamName }}</strong>
      </div>
    </template>
  </div>
</template>
