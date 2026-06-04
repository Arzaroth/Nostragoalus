<script setup lang="ts">
const { session } = useAuth()
</script>

<template>
  <div class="text-center mt-16 flex flex-col gap-4 items-center">
    <h1 class="text-4xl font-bold">Mon Petit Prono</h1>
    <p class="opacity-70 max-w-md">
      Predict FIFA World Cup 2026 scores, earn points for how close you get, and climb the global ranking.
    </p>
    <NuxtLink :to="session?.data ? '/matches' : '/login'">
      <Button :label="session?.data ? 'Go to matches' : 'Get started'" />
    </NuxtLink>
  </div>
</template>
