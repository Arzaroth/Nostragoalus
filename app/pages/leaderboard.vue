<script setup lang="ts">
const { data: rows, isLoading } = useLeaderboard()
</script>

<template>
  <div>
    <h1 class="text-2xl font-bold mb-4">Global ranking</h1>
    <DataTable :value="rows ?? []" :loading="isLoading" striped-rows>
      <Column field="rank" header="#" style="width: 3rem" />
      <Column field="displayName" header="Player" />
      <Column field="totalPoints" header="Points" />
      <Column field="exactCount" header="Exact scores" />
      <template #empty>No scores yet.</template>
    </DataTable>
  </div>
</template>
