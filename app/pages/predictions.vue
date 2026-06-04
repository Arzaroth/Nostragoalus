<script setup lang="ts">
const { data: predictions, isLoading } = useMyPredictions()
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold mb-4">My predictions</h1>
    <DataTable :value="predictions ?? []" :loading="isLoading" striped-rows>
      <Column header="Pick">
        <template #body="{ data }">
          {{ data.homeGoals }}–{{ data.awayGoals }}<span v-if="data.isJoker" title="Joker"> ★</span>
        </template>
      </Column>
      <Column header="Result">
        <template #body="{ data }">{{ tierLabel(data.baseTier) || '—' }}</template>
      </Column>
      <Column header="Points">
        <template #body="{ data }">{{ data.totalPoints ?? '—' }}</template>
      </Column>
      <template #empty>You haven't made any predictions yet.</template>
    </DataTable>
  </div>
</template>
