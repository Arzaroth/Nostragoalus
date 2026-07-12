<script setup lang="ts">
import type { ShowcaseIconDto } from '#shared/types/achievements'

defineProps<{ items: ShowcaseIconDto[] }>()
const { t } = useI18n()
</script>

<template>
  <span v-if="items.length > 0" class="inline-flex items-center gap-0.5 align-middle">
    <i
      v-for="it in items"
      :key="it.key"
      v-tooltip.top="t(`achievements.badge.${it.key}.name`)"
      :class="ACHIEVEMENT_CATEGORY_ICON[it.category] ?? FALLBACK_ACHIEVEMENT_ICON"
      class="text-xs"
      :style="`color:${it.tier ? ACHIEVEMENT_TIER_TINT[it.tier] : 'var(--p-primary-color)'}`"
    />
  </span>
</template>
