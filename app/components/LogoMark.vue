<script setup lang="ts">
import LogoDefault from './logos/LogoDefault.vue'

// The header mark follows the active skin: an <img> of that pony's head, or the
// default crystal ball when un-skinned. A plain <img> (rather than a dynamic
// SVG component) keeps the swap robust - it can't drop out across hydration.
const { skin } = useSkin()
const src = computed(() => (skin.value ? `/skins/${skin.value}.png` : null))
</script>

<template>
  <img v-if="src" :src="src" alt="" class="logo-mark-img" />
  <LogoDefault v-else />
</template>

<style scoped>
.logo-mark-img {
  display: block;
  object-fit: contain;
}
</style>
