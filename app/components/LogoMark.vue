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

// The logo follows the active skin: each pony swaps in its own bespoke mark,
// and the default (un-skinned) is the crystal ball. A single rendered <svg>
// root means the sizing class the parent passes (e.g. h-12 w-auto) falls
// through to it unchanged.
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
