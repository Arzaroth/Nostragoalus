<script setup lang="ts">
// Shared chrome for the public info pages (about, license, ...): starfield
// behind, footer below - so they can't drift apart page by page.
</script>

<template>
  <div class="flex flex-col gap-12 pb-12">
    <StarField :style="{ zIndex: -10 }" />
    <slot />
    <AppFooter />
  </div>
</template>
