<script setup lang="ts">
// One team's half of the pitch, own goal at the bottom and the halfway line at
// the top, drawn behind the XI. Stretches to its container (preserveAspectRatio
// none) - the markings are stylised, not to scale.
</script>

<template>
  <svg viewBox="0 0 100 130" preserveAspectRatio="none" class="pitch-half" aria-hidden="true">
    <g fill="none" stroke="rgba(255, 255, 255, 0.4)" stroke-width="0.7">
      <rect x="1.5" y="1.5" width="97" height="127" />
      <!-- penalty box, goal box, spot and arc at the own goal (bottom) -->
      <rect x="21" y="100" width="58" height="28.5" />
      <rect x="37" y="117" width="26" height="11.5" />
      <path d="M 36.1 100 A 16 16 0 0 1 63.9 100" />
      <circle cx="50" cy="108" r="1" fill="rgba(255, 255, 255, 0.4)" stroke="none" />
      <!-- the top edge is the halfway line; half the centre circle dips in -->
      <path d="M 37 1.5 A 13 13 0 0 0 63 1.5" />
      <circle cx="50" cy="1.5" r="1" fill="rgba(255, 255, 255, 0.4)" stroke="none" />
    </g>
  </svg>
</template>

<style scoped>
.pitch-half {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
</style>
