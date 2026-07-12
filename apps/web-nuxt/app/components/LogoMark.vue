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

// The header mark follows the active skin: each pony swaps in its own
// crystal-ball variant, the default is the original. The skin is cookie-backed
// and read on the server too, so the right mark is rendered on the first paint
// - no hydration mismatch, no default-then-skin flash. The parent's sizing
// class (h-12 w-auto) falls through to the single <svg> root.
const { skin } = useSkin()

const PONY_LOGOS: Record<SkinId, Component> = {
  twilight: LogoTwilight,
  rainbow: LogoRainbow,
  pinkie: LogoPinkie,
  applejack: LogoApplejack,
  rarity: LogoRarity,
  fluttershy: LogoFluttershy,
}
const current = computed<Component>(() => (skin.value ? PONY_LOGOS[skin.value] : LogoDefault))
</script>

<template>
  <component :is="current" />
</template>
