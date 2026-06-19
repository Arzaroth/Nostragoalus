<script setup lang="ts">
import { REACTION_EMOJIS, REACTION_GLYPHS, type ReactionEmoji, type ReactionTotals } from '#shared/reactions'

// Pure display: the parent owns the single useCompetitionReactions() instance
// (it holds the WS connection) and passes the maps down. Read-only - a click
// falls through to the card's navigation, there is no react action here.
const props = defineProps<{
  matchId: string
  totals: Record<string, ReactionTotals>
  leagueTotals?: Record<string, ReactionTotals>
  leagueActive?: boolean
  mine?: Record<string, ReactionEmoji>
}>()

const { t } = useI18n()

// With a pony skin active the reaction faces turn into the mane six, matching
// ReactionBar. Any active skin triggers it (skin is only set once the konami
// easter egg is unlocked, so no extra gate is needed).
const { skin } = useSkin()
const PONY_FACE: Record<ReactionEmoji, string> = {
  FIRE: 'rainbow',
  GOAL: 'applejack',
  WOW: 'twilight',
  LAUGH: 'pinkie',
  SAD: 'fluttershy',
  ANGRY: 'rarity',
}

// The active scope's counts: the selected league's when one is picked, otherwise
// the global counts (mirrors the match-page bar).
const scoped = computed<ReactionTotals | undefined>(() =>
  props.leagueActive ? props.leagueTotals?.[props.matchId] : props.totals[props.matchId],
)
const shown = computed(() => REACTION_EMOJIS.filter((e) => (scoped.value?.[e] ?? 0) > 0))
const mineEmoji = computed(() => props.mine?.[props.matchId] ?? null)
// The global grand total rides along as context when viewing a league's counts.
const globalTotal = computed(() => {
  const g = props.totals[props.matchId]
  return g ? REACTION_EMOJIS.reduce((sum, e) => sum + (g[e] ?? 0), 0) : 0
})
</script>

<template>
  <div
    v-if="shown.length"
    class="flex flex-wrap items-center justify-center gap-2 text-xs"
    style="color: var(--p-text-muted-color)"
  >
    <span
      v-for="e in shown"
      :key="e"
      v-tooltip.top="t(`reactions.label.${e}`)"
      class="inline-flex items-center gap-1 tabular-nums"
      :class="mineEmoji === e ? 'font-bold' : ''"
      :style="mineEmoji === e ? 'color: var(--p-primary-color)' : ''"
    >
      <img v-if="skin" :src="`/skins/${PONY_FACE[e]}.png`" class="w-4 h-4 object-contain" alt="" aria-hidden="true">
      <span v-else aria-hidden="true">{{ REACTION_GLYPHS[e] }}</span>
      {{ scoped?.[e] ?? 0 }}
    </span>
    <span
      v-if="leagueActive && globalTotal"
      v-tooltip.bottom="t('reactions.leagueHint')"
      class="tabular-nums opacity-70"
    >🌐 {{ globalTotal }}</span>
  </div>
</template>
