<script setup lang="ts">
// "N watching now" line. The caller gates visibility (live match, count > 0);
// this just renders the localized, pluralized count with a live pulse dot.
const props = defineProps<{ count: number }>()
const { t } = useI18n()
</script>

<template>
  <div class="flex items-center justify-center gap-1.5 text-xs" style="color: var(--p-text-muted-color)">
    <span class="w-1.5 h-1.5 rounded-full animate-pulse" style="background: var(--ng-danger)" />
    <span>{{ t('match.watching', { n: props.count }, props.count) }}</span>
  </div>
</template>
