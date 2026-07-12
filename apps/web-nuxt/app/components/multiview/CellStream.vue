<script setup lang="ts">
import type { MatchMediaItem } from '#shared/match-media'

defineProps<{ item: MatchMediaItem | null }>()
const { t } = useI18n()
</script>

<template>
  <div class="h-full flex items-center justify-center">
    <MatchMediaEmbed v-if="item" :item="item" class="w-full" />
    <span v-else class="text-sm" style="color: var(--p-text-muted-color)">{{ t('multiview.streamUnavailable') }}</span>
  </div>
</template>
