<script setup lang="ts">
import { REACTION_EMOJIS, REACTION_GLYPHS, type ReactionEmoji } from '../../shared/reactions'

const props = defineProps<{ matchId: string }>()

const { t } = useI18n()
const { totals, leagueTotals, mine, leagueActive, signedIn, pending, react } = useMatchReactions(() => props.matchId)

// With a pony skin active, the reaction faces turn into the mane six (one head
// per reaction). Any active skin triggers it - skin is only ever set once the
// konami easter egg is unlocked, so no extra gate is needed.
const { skin } = useSkin()
const PONY_FACE: Record<ReactionEmoji, string> = {
  FIRE: 'rainbow',
  GOAL: 'applejack',
  WOW: 'twilight',
  LAUGH: 'pinkie',
  SAD: 'fluttershy',
  ANGRY: 'rarity',
}

// Buttons show the active scope's count: the selected league's when one is
// picked, otherwise the global count. The other scope's grand total rides in
// the footer line for context.
function count(emoji: ReactionEmoji): number {
  return (leagueActive.value ? leagueTotals.value : totals.value)[emoji] ?? 0
}
const globalTotal = computed(() => REACTION_EMOJIS.reduce((sum, e) => sum + (totals.value[e] ?? 0), 0))
</script>

<template>
  <div class="flex flex-col items-center gap-1.5 mt-4 pt-3 border-t text-sm" style="border-color: var(--p-content-border-color)">
    <span class="text-xs font-semibold uppercase tracking-wider" style="color: var(--p-text-muted-color)">
      {{ t('reactions.title') }}
    </span>
    <div class="flex flex-wrap items-center justify-center gap-1.5">
      <button
        v-for="emoji in REACTION_EMOJIS"
        :key="emoji"
        type="button"
        :disabled="!signedIn || pending"
        :aria-pressed="mine === emoji"
        :aria-label="t(`reactions.label.${emoji}`)"
        v-tooltip.top="signedIn ? t(`reactions.label.${emoji}`) : t('reactions.signInHint')"
        class="inline-flex items-center gap-1 px-2 py-1 rounded-full border tabular-nums transition disabled:opacity-50 disabled:cursor-not-allowed"
        :class="mine === emoji ? 'font-bold' : 'opacity-80 enabled:hover:opacity-100'"
        :style="mine === emoji
          ? 'border-color: var(--p-primary-color); background: color-mix(in srgb, var(--p-primary-color) 15%, transparent); color: var(--p-primary-color)'
          : 'border-color: var(--p-content-border-color); color: var(--p-text-muted-color)'"
        @click="react(emoji)"
      >
        <img v-if="skin" :src="`/skins/${PONY_FACE[emoji]}.png`" class="w-5 h-5 object-contain" alt="" aria-hidden="true">
        <span v-else aria-hidden="true">{{ REACTION_GLYPHS[emoji] }}</span>
        <span v-if="count(emoji)">{{ count(emoji) }}</span>
      </button>
    </div>
    <span
      v-if="leagueActive && globalTotal"
      v-tooltip.bottom="t('reactions.leagueHint')"
      class="text-xs tabular-nums"
      style="color: var(--p-text-muted-color)"
    >🌐 {{ globalTotal }}</span>
  </div>
</template>
