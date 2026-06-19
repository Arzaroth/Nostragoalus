<script setup lang="ts">
// 418 art: a teapot tips toward a cup and pours a tiny football out of its
// spout, steam rising. The spout faces the cup so the pour reads correctly. Pure
// CSS/SVG so it honours prefers-reduced-motion (the media query below freezes it
// to a static mid-pour pose). Decorative - aria-hidden.
</script>

<template>
  <svg class="teapot" viewBox="0 0 130 96" role="img" aria-hidden="true">
    <!-- steam wisps off the lid -->
    <g class="steam" fill="var(--p-text-muted-color)">
      <rect class="s1" x="44" y="8" width="3" height="3" />
      <rect class="s2" x="52" y="4" width="3" height="3" />
      <rect class="s3" x="60" y="8" width="3" height="3" />
    </g>

    <!-- teapot: spout faces the cup (right), small handle on the left -->
    <g class="pot">
      <!-- handle (left, compact) -->
      <path d="M31 34 q-12 2 -12 14 q0 8 9 10" fill="none" stroke="var(--p-primary-color)" stroke-width="5" />
      <!-- body -->
      <rect x="30" y="30" width="42" height="32" rx="9" fill="var(--p-primary-color)" />
      <!-- spout, angled up toward the cup -->
      <polygon points="70,33 92,27 91,39 70,46" fill="var(--p-primary-color)" />
      <!-- lid + knob -->
      <rect x="36" y="23" width="32" height="9" rx="4" fill="var(--p-primary-color)" />
      <rect x="48" y="16" width="7" height="7" rx="2" fill="var(--p-primary-color)" />
      <!-- highlight -->
      <rect x="38" y="37" width="6" height="12" rx="3" fill="rgba(255,255,255,0.35)" />
    </g>

    <!-- the football, arcing from the spout into the cup -->
    <g class="ball">
      <circle cx="0" cy="0" r="5" fill="#ffffff" stroke="#332a60" stroke-width="1" />
      <polygon points="0,-3 3,-1 2,3 -2,3 -3,-1" fill="#332a60" />
    </g>

    <!-- cup -->
    <g class="cup">
      <path d="M84 70 h28 l-4 18 h-20 z" fill="var(--p-content-border-color)" />
      <rect x="84" y="67" width="28" height="5" rx="2" fill="var(--p-text-color)" opacity="0.35" />
    </g>
  </svg>
</template>

<style scoped>
.teapot {
  width: 300px;
  max-width: 80vw;
  height: auto;
  filter: drop-shadow(0 10px 30px rgba(120, 90, 220, 0.28));
}
.pot {
  transform-box: fill-box;
  transform-origin: 46% 78%;
  animation: tip 3.2s ease-in-out infinite;
}
/* Tip toward the spout (clockwise) so the right-facing spout dips to pour. */
@keyframes tip {
  0%, 28% { transform: rotate(0deg); }
  44%, 68% { transform: rotate(13deg); }
  84%, 100% { transform: rotate(0deg); }
}
.ball {
  offset-path: path('M90 36 C 96 50, 100 63, 98 72');
  offset-distance: 0%;
  opacity: 0;
  animation: pour 3.2s ease-in infinite;
}
@keyframes pour {
  0%, 40% { opacity: 0; offset-distance: 0%; }
  44% { opacity: 1; }
  68% { opacity: 1; offset-distance: 100%; }
  74%, 100% { opacity: 0; offset-distance: 100%; }
}
.steam rect {
  opacity: 0;
  animation: rise 3.2s ease-in-out infinite;
}
.steam .s2 { animation-delay: 0.45s; }
.steam .s3 { animation-delay: 0.9s; }
@keyframes rise {
  0% { opacity: 0; transform: translateY(7px); }
  40% { opacity: 0.55; }
  100% { opacity: 0; transform: translateY(-12px); }
}
@media (prefers-reduced-motion: reduce) {
  .pot, .ball, .steam rect { animation: none; }
  .pot { transform: rotate(13deg); }
  .ball { opacity: 1; offset-distance: 60%; }
}
</style>
