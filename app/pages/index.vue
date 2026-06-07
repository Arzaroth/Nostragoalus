<script setup lang="ts">
const { t } = useI18n()
const { session } = useAuth()
const config = useRuntimeConfig()
const last = useLastCompetition()
const homeLink = computed(() => (session && session.data ? `/${last.value}/matches` : '/login'))
</script>

<template>
  <div class="flex flex-col items-center text-center gap-6 py-16">
    <span class="text-6xl">🔮</span>
    <h1 class="text-5xl font-extrabold">
      <span class="bg-gradient-to-r from-indigo-500 to-emerald-500 bg-clip-text text-transparent">
        {{ config.public.appName }}
      </span>
    </h1>
    <p class="text-lg max-w-md" style="color: var(--p-text-muted-color)">{{ t('home.tagline') }}</p>
    <NuxtLink :to="homeLink">
      <Button :label="session && session.data ? t('home.goToMatches') : t('home.getStarted')" icon="pi pi-arrow-right" icon-pos="right" size="large" />
    </NuxtLink>
  </div>
</template>
