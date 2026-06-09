<script setup lang="ts">
const { t } = useI18n()
defineProps<{ odds: { home: number; draw: number; away: number } | null | undefined }>()
const fmt = (v: number) => v.toFixed(2)
</script>

<template>
  <div
    v-if="odds"
    class="flex items-center gap-2 text-xs tabular-nums"
    style="color: var(--p-text-muted-color)"
    :title="t('odds.title')"
  >
    <span :aria-label="t('odds.home')"><span class="font-semibold">1</span> {{ fmt(odds.home) }}</span>
    <span aria-hidden="true">·</span>
    <span :aria-label="t('odds.draw')"><span class="font-semibold">X</span> {{ fmt(odds.draw) }}</span>
    <span aria-hidden="true">·</span>
    <span :aria-label="t('odds.away')"><span class="font-semibold">2</span> {{ fmt(odds.away) }}</span>
  </div>
</template>
