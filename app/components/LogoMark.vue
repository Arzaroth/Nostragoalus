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
// crystal-ball variant, the default is the original. The skin lives in
// client-only state (localStorage), so the server can't know it - rendering
// inside <ClientOnly> with the default as the SSR fallback means the dynamic
// mark is mounted fresh on the client and never drops out to a hydration
// mismatch.
defineOptions({ inheritAttrs: false })
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
  <ClientOnly>
    <component :is="current" v-bind="$attrs" />
    <template #fallback>
      <LogoDefault v-bind="$attrs" />
    </template>
  </ClientOnly>
</template>
