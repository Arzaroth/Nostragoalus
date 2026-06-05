<script setup lang="ts">
const { query, setPick } = useChampion()
const data = computed<any>(() => query.data.value)
const selectedCode = ref<string | null>(null)
const saving = setPick.isPending

watchEffect(() => {
  selectedCode.value = data.value?.myPick?.teamCode ?? null
})

function save() {
  const team = data.value?.teams?.find((t: ChampionTeam) => t.code === selectedCode.value)
  if (team) setPick.mutate(team)
}
</script>

<template>
  <div
    v-if="data && data.competition"
    class="ng-card rounded-2xl border p-4 mb-6 flex flex-wrap items-center gap-3"
    style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
  >
    <div class="flex items-center gap-2 font-semibold shrink-0"><span class="text-xl">🏆</span> Your champion</div>

    <template v-if="data.locked">
      <span v-if="data.myPick" class="flex items-center gap-2">
        <img v-if="flagUrl(data.myPick.teamCode)" :src="flagUrl(data.myPick.teamCode) || ''" class="w-6 h-6 rounded" alt="" >
        <strong>{{ data.myPick.teamName }}</strong>
        <Tag v-if="data.myPick.awardedPoints > 0" :value="`+${data.myPick.awardedPoints} pts`" severity="success" />
      </span>
      <span v-else style="color: var(--p-text-muted-color)">No champion picked — locked.</span>
    </template>

    <template v-else>
      <Select
        v-model="selectedCode"
        :options="data.teams"
        option-label="name"
        option-value="code"
        filter
        placeholder="Pick the winner"
        size="small"
        class="min-w-56"
      />
      <Button label="Save" icon="pi pi-check" size="small" :disabled="!selectedCode" :loading="saving" @click="save" />
      <span class="text-xs flex-1" style="color: var(--p-text-muted-color)">
        Bonus if your pick lifts the trophy · locks at the first kickoff.
      </span>
    </template>
  </div>
</template>
