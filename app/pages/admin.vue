<script setup lang="ts">
const result = ref('')
const busy = ref(false)

async function run(action: () => Promise<unknown>) {
  busy.value = true
  result.value = ''
  try {
    result.value = JSON.stringify(await action(), null, 2)
  } catch (error) {
    result.value = `Error: ${(error as Error).message}`
  } finally {
    busy.value = false
  }
}

const importFixtures = () => run(() => $fetch('/api/admin/import-fixtures', { method: 'POST' }))
const sync = (task: string) => run(() => $fetch('/api/admin/sync', { method: 'POST', body: { task } }))
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="text-2xl font-bold">Admin</h1>
    <div class="flex gap-2 flex-wrap">
      <Button label="Import fixtures" :loading="busy" @click="importFixtures" />
      <Button label="Run finalize" severity="secondary" :loading="busy" @click="sync('finalize')" />
      <Button label="Refresh fixtures" severity="secondary" :loading="busy" @click="sync('fixtures')" />
      <Button label="Poll scores" severity="secondary" :loading="busy" @click="sync('live')" />
    </div>
    <pre v-if="result" class="text-xs p-3 rounded overflow-auto" style="background: var(--p-content-background); border: 1px solid var(--p-content-border-color)">{{ result }}</pre>
  </div>
</template>
