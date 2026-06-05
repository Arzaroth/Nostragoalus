<script setup lang="ts">
const { session } = useAuth()
const config = useRuntimeConfig()
</script>

<template>
  <div class="flex flex-col items-center text-center gap-6 py-16">
    <span class="text-6xl">🔮</span>
    <h1 class="text-5xl font-extrabold">
      <span class="bg-gradient-to-r from-indigo-500 to-emerald-500 bg-clip-text text-transparent">
        {{ config.public.appName }}
      </span>
    </h1>
    <p class="text-lg max-w-md" style="color: var(--p-text-muted-color)">
      Predict football scores, earn points for how close you get, and out-foresee your friends on the global ranking.
    </p>
    <NuxtLink :to="session && session.data ? '/matches' : '/login'">
      <Button :label="session && session.data ? 'Go to matches' : 'Get started'" icon="pi pi-arrow-right" icon-pos="right" size="large" />
    </NuxtLink>
  </div>
</template>
