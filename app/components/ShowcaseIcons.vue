<script setup lang="ts">
import type { ShowcaseIconDto } from '#shared/types/achievements'

defineProps<{ items: ShowcaseIconDto[] }>()
const { t } = useI18n()

const CATEGORY_ICON: Record<string, string> = {
  MILESTONE: 'pi pi-bolt',
  BEHAVIORAL: 'pi pi-clock',
  CROWD: 'pi pi-users',
  JOKER: 'pi pi-star',
  ORACLE: 'pi pi-eye',
  STREAK: 'pi pi-forward',
  TROPHY_META: 'pi pi-trophy',
  SECRET: 'pi pi-sparkles',
}
const TIER_TINT: Record<string, string> = { BRONZE: '#cd7f32', SILVER: '#9ca3af', GOLD: '#eab308' }
</script>

<template>
  <span v-if="items.length > 0" class="inline-flex items-center gap-0.5 align-middle">
    <i
      v-for="it in items"
      :key="it.key"
      v-tooltip.top="t(`achievements.badge.${it.key}.name`)"
      :class="CATEGORY_ICON[it.category] ?? 'pi pi-verified'"
      class="text-xs"
      :style="`color:${it.tier ? TIER_TINT[it.tier] : 'var(--p-primary-color)'}`"
    />
  </span>
</template>
