<script setup lang="ts">
import { REACTION_GLYPHS, type ReactionEmoji } from '#shared/reactions'

// One reaction face. With a pony skin active the glyph becomes a mane-six head
// (one per reaction); skin is only ever set after the konami easter egg unlock,
// so any active skin is enough of a gate. Shared by the match ReactionBar and
// chat message reactions so both render identically, pony mode included.
defineProps<{ emoji: ReactionEmoji }>()
const { skin } = useSkin()
const PONY_FACE: Record<ReactionEmoji, string> = {
  FIRE: 'rainbow',
  GOAL: 'applejack',
  WOW: 'twilight',
  LAUGH: 'pinkie',
  SAD: 'fluttershy',
  ANGRY: 'rarity',
}
</script>

<template>
  <img v-if="skin" :src="`/skins/${PONY_FACE[emoji]}.png`" class="w-5 h-5 object-contain" alt="" aria-hidden="true">
  <span v-else aria-hidden="true">{{ REACTION_GLYPHS[emoji] }}</span>
</template>
