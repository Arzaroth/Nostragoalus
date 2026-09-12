<script setup lang="ts">
import type { Component } from 'vue'
import type { SkinId } from '~/utils/skins'
import LogoDefault from './logos/LogoDefault.vue'
import LogoTwilight from './logos/LogoTwilight.vue'
import LogoRainbow from './logos/LogoRainbow.vue'
import LogoPinkie from './logos/LogoPinkie.vue'
import LogoApplejack from './logos/LogoApplejack.vue'
import LogoRarity from './logos/LogoRarity.vue'
import LogoFluttershy from './logos/LogoFluttershy.vue'
import LogoRugby from './logos/LogoRugby.vue'

// The header mark follows the active skin, then the competition's sport: each
// pony swaps in its own crystal-ball variant, a rugby competition swaps the
// football inside the ball for a rugby ball, and the default is the original.
// The skin is cookie-backed
// and read on the server too, so the right mark is rendered on the first paint
// - no hydration mismatch, no default-then-skin flash. The parent's sizing
// class (h-12 w-auto) falls through to the single <svg> root.
const { skin } = useSkin()
const sport = useSelectedSport()

const PONY_LOGOS: Record<SkinId, Component> = {
  twilight: LogoTwilight,
  rainbow: LogoRainbow,
  pinkie: LogoPinkie,
  applejack: LogoApplejack,
  rarity: LogoRarity,
  fluttershy: LogoFluttershy,
}
// Skin first: it is an unlock the user went looking for, and it should not be
// undone by which tournament they happen to be viewing. Otherwise the mark
// follows the competition's sport.
const current = computed<Component>(() => {
  if (skin.value) return PONY_LOGOS[skin.value]
  return sport.value === 'RUGBY_UNION' ? LogoRugby : LogoDefault
})
</script>

<template>
  <component :is="current" />
</template>
