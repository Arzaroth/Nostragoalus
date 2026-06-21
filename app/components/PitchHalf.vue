<script setup lang="ts">
// One team's half of the pitch, own goal at the bottom and the halfway line at
// the top, drawn behind the absolutely-placed XI. Stretches to its container
// (preserveAspectRatio none) - the markings are stylised, not to scale.
</script>

<template>
  <svg viewBox="0 0 100 130" preserveAspectRatio="none" class="pitch-half" aria-hidden="true">
    <g fill="none" stroke="rgba(255, 255, 255, 0.22)" stroke-width="0.7">
      <rect x="2" y="2" width="96" height="126" rx="1.5" />
      <!-- penalty box, goal box and spot at the own goal (bottom) -->
      <rect x="21" y="100" width="58" height="28" />
      <rect x="37" y="117" width="26" height="11" />
      <path d="M 36.1 100 A 16 16 0 0 1 63.9 100" />
      <circle cx="50" cy="108" r="0.9" fill="rgba(255, 255, 255, 0.22)" stroke="none" />
      <!-- the top edge is the halfway line; half the centre circle dips in -->
      <path d="M 37 2 A 13 13 0 0 0 63 2" />
      <circle cx="50" cy="2" r="0.9" fill="rgba(255, 255, 255, 0.22)" stroke="none" />
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
