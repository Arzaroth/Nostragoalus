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

<!-- Global, and hoisted here rather than kept in each mark: Vue's scoped
     compiler mangles ":global(ancestor) .child", and LogoMark is the one
     component that always mounts exactly one mark - so the hover rules cannot
     drift between the football and rugby versions, or vanish when only the
     rugby one renders. -->
<style>
.logo-mark .sec {
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: visible; /* hover works even while transparent */
}
/* each section glows when YOU touch it, paint-bucket style */
.logo-mark .sec:hover {
  opacity: 0.6;
  transition-duration: 0.12s;
}
.logo-mark .sec-core:hover {
  opacity: 0.85;
}
.logo-mark .sec-ring:hover {
  opacity: 0.3; /* the big ring stays subtle so it doesn't swallow the orb */
}
/* the decorative layers above the sections must not steal the hover */
.logo-mark .lm-sections ~ g {
  pointer-events: none;
}
</style>
