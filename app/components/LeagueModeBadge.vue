<script setup lang="ts">
import type { LeagueMode } from '../composables/useLeagues'

const props = defineProps<{ mode: LeagueMode; lives?: number | null }>()

const { t } = useI18n()

const MODE_KEY: Record<LeagueMode, string> = { NORMAL: 'Normal', EASY: 'Easy', HARD: 'Hard', HARDCORE: 'Hardcore' }
const SEVERITY: Record<LeagueMode, string> = { NORMAL: 'secondary', EASY: 'success', HARD: 'warn', HARDCORE: 'danger' }

const label = computed(() => t(`leagues.mode${MODE_KEY[props.mode]}`))
const tip = computed(() => {
  const desc = t(`leagues.mode${MODE_KEY[props.mode]}Desc`)
  if (props.mode === 'HARDCORE' && props.lives != null) {
    return `${desc} (${t('leagues.livesCount', { n: props.lives }, props.lives ?? 0)})`
  }
  return desc
})
</script>

<template>
  <!-- NORMAL is the default game; no badge keeps the common case uncluttered. -->
  <Tag v-if="mode !== 'NORMAL'" v-tooltip.top="tip" :value="label" :severity="SEVERITY[mode]" />
</template>
