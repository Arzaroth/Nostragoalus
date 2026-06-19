<script setup lang="ts">
// 500 art: the referee brandishes a red card at a glitching server (it has been
// "sent off"). The arm is hinged at the shoulder and swings up; the card flips
// out of the hand with an impact flash, the server shakes and a sweat drop flicks
// off. Pure CSS/SVG so it honours prefers-reduced-motion (frozen to a static
// raised pose below). Decorative - aria-hidden.
</script>

<template>
  <svg class="redcard" viewBox="0 0 130 104" role="img" aria-hidden="true">
    <!-- referee -->
    <g fill="var(--p-text-color)">
      <circle cx="36" cy="30" r="9" />
      <rect x="29" y="40" width="14" height="24" rx="4" />
      <rect x="29" y="63" width="5" height="22" />
      <rect x="38" y="63" width="5" height="22" />
      <!-- raised arm, hinged at the shoulder (not the head) -->
      <rect class="arm" x="41" y="43" width="24" height="6" rx="3" />
    </g>

    <!-- impact ticks that pop as the card is brandished -->
    <g class="impact" stroke="var(--p-primary-color)" stroke-width="2" stroke-linecap="round">
      <line x1="56" y1="6" x2="51" y2="2" />
      <line x1="69" y1="4" x2="69" y2="0" />
      <line x1="82" y1="6" x2="87" y2="2" />
    </g>

    <!-- the red card: flips up out of the hand, then flashes -->
    <rect class="card" x="60" y="6" width="18" height="26" rx="2" fill="var(--ng-danger)" />

    <!-- the sent-off server -->
    <g class="server">
      <rect x="86" y="56" width="38" height="44" rx="4" fill="var(--p-content-border-color)" />
      <rect x="91" y="62" width="28" height="3" rx="1" fill="var(--p-text-color)" opacity="0.4" />
      <rect x="91" y="68" width="28" height="3" rx="1" fill="var(--p-text-color)" opacity="0.4" />
      <circle class="led" cx="95" cy="92" r="2.5" fill="var(--ng-danger)" />
      <text x="107" y="88" font-size="11" font-family="monospace" text-anchor="middle" fill="var(--p-text-color)">x_x</text>
    </g>

    <!-- a sweat drop flicking off the server as it's sent packing -->
    <circle class="sweat" cx="88" cy="58" r="2" fill="var(--p-text-muted-color)" />
  </svg>
</template>

<style scoped>
.redcard {
  width: 320px;
  max-width: 82vw;
  height: auto;
  filter: drop-shadow(0 10px 30px rgba(120, 90, 220, 0.28));
}
.arm {
  transform-box: fill-box;
  transform-origin: 0% 50%;
  animation: armraise 2.8s ease-in-out infinite;
}
/* Swing up past the mark, then settle - a brandish, not a slow lift. */
@keyframes armraise {
  0% { transform: rotate(24deg); }
  18% { transform: rotate(-46deg); }
  26%, 100% { transform: rotate(-36deg); }
}
.card {
  transform-box: fill-box;
  transform-origin: 50% 100%;
  animation: raise 2.8s ease-in-out infinite;
}
@keyframes raise {
  0% { transform: translateY(18px) scaleY(0) rotate(-8deg); filter: none; }
  18% { transform: translateY(0) scaleY(1.1) rotate(0deg); }
  26% { transform: translateY(0) scaleY(1) rotate(0deg); }
  82% { filter: none; }
  90% { filter: brightness(1.5) drop-shadow(0 0 6px var(--ng-danger)); }
  100% { transform: translateY(0) scaleY(1) rotate(0deg); filter: none; }
}
.impact {
  transform-box: fill-box;
  transform-origin: 50% 80%;
  opacity: 0;
  animation: pop 2.8s ease-out infinite;
}
@keyframes pop {
  0%, 16% { opacity: 0; transform: scale(0.3); }
  24% { opacity: 1; transform: scale(1); }
  40% { opacity: 0; transform: scale(1.25); }
  100% { opacity: 0; transform: scale(1.25); }
}
.server { animation: glitch 2.8s steps(1) infinite; }
@keyframes glitch {
  0%, 22% { transform: translate(0, 0); filter: none; }
  26% { transform: translate(6px, 0); filter: brightness(1.2); }
  30% { transform: translate(2px, 0); }
  84% { transform: translate(2px, 0); filter: none; }
  86% { transform: translate(-2px, 1px); }
  88% { transform: translate(3px, -1px); filter: hue-rotate(50deg); }
  90% { transform: translate(-1px, 0); }
  92%, 100% { transform: translate(2px, 0); filter: none; }
}
.sweat {
  transform-box: fill-box;
  opacity: 0;
  animation: flick 2.8s ease-out infinite;
}
@keyframes flick {
  0%, 24% { opacity: 0; transform: translate(0, 0); }
  28% { opacity: 0.85; transform: translate(0, 0); }
  52% { opacity: 0; transform: translate(-12px, -7px); }
  100% { opacity: 0; transform: translate(-12px, -7px); }
}
.led { animation: blink 1s steps(1) infinite; }
@keyframes blink { 0%, 60% { opacity: 1; } 61%, 100% { opacity: 0.25; } }
@media (prefers-reduced-motion: reduce) {
  .card, .arm, .server, .led, .impact, .sweat { animation: none; }
  .card { transform: none; }
  .arm { transform: rotate(-36deg); }
  .impact, .sweat { opacity: 0; }
}
</style>
