<script setup lang="ts">
// The Golden Boot, as a real gold icon - the best-scorer award shares no glyph
// with assists (which keep the plain 👟). Sizes to the surrounding font (1em),
// so it drops in wherever the emoji was. A per-instance gradient id keeps
// multiple boots on one page from sharing (and clipping) defs.
const uid = useId()
</script>

<template>
  <svg viewBox="0 0 24 24" width="1em" height="1em" class="golden-boot" role="img" aria-hidden="true">
    <defs>
      <linearGradient :id="`gb-${uid}`" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fde68a" />
        <stop offset="55%" stop-color="#f59e0b" />
        <stop offset="100%" stop-color="#d97706" />
      </linearGradient>
    </defs>
    <!-- boot upper: toe at the left, ankle collar at the top right -->
    <path
      :fill="`url(#gb-${uid})`"
      stroke="#9a6510"
      stroke-width="0.6"
      stroke-linejoin="round"
      d="M1.6 13.4 C1.6 12.6 2.1 12.1 3 11.9 L9.4 10.7 C10.9 10.4 12 9.7 12.9 8.5 L14.4 6.6 C15 5.9 15.8 5.6 16.7 5.6 L18.4 5.6 C19.8 5.6 20.8 6.5 21.1 7.9 L21.9 11.6 C22.1 12.7 22.2 13.7 22.2 14.8 L22.2 15.4 C22.2 16.2 21.7 16.7 20.9 16.7 L3 16.7 C2.1 16.7 1.6 16.2 1.6 15.4 Z"
    />
    <!-- laces -->
    <g stroke="#fff7e0" stroke-width="0.7" stroke-linecap="round" opacity="0.85">
      <line x1="12" y1="9.6" x2="13.7" y2="8.3" />
      <line x1="13.1" y1="10.8" x2="14.8" y2="9.5" />
      <line x1="14.2" y1="11.9" x2="15.8" y2="10.6" />
    </g>
    <!-- sole + studs -->
    <path fill="#8a5a16" d="M1.6 16.7 L22.2 16.7 L22.2 18 C22.2 18.7 21.7 19.1 21 19.1 L2.8 19.1 C2.1 19.1 1.6 18.7 1.6 18 Z" />
    <g fill="#8a5a16">
      <rect x="3.2" y="19.1" width="2.1" height="1.7" rx="0.5" />
      <rect x="9" y="19.1" width="2.1" height="1.7" rx="0.5" />
      <rect x="14.8" y="19.1" width="2.1" height="1.7" rx="0.5" />
      <rect x="19" y="19.1" width="2.1" height="1.7" rx="0.5" />
    </g>
  </svg>
</template>

<style scoped>
.golden-boot {
  display: inline-block;
  vertical-align: -0.18em;
  overflow: visible;
}
</style>
