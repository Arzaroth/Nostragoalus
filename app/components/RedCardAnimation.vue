<script setup lang="ts">
// 500 art: the referee raises a red card at a glitching server (it has been
// "sent off"). Pure CSS/SVG so it honours prefers-reduced-motion (frozen to a
// static pose below). Decorative - aria-hidden.
</script>

<template>
  <svg class="redcard" viewBox="0 0 130 104" role="img" aria-hidden="true">
    <!-- referee -->
    <g fill="var(--p-text-color)">
      <circle cx="36" cy="32" r="9" />
      <rect x="29" y="41" width="14" height="24" rx="4" />
      <rect x="29" y="63" width="5" height="22" />
      <rect x="38" y="63" width="5" height="22" />
      <rect class="arm" x="42" y="30" width="20" height="6" rx="3" />
    </g>

    <!-- the red card: flips up out of the hand, then pulses -->
    <rect class="card" x="58" y="6" width="18" height="26" rx="2" fill="var(--ng-danger)" />

    <!-- the sent-off server -->
    <g class="server">
      <rect x="84" y="54" width="38" height="44" rx="4" fill="var(--p-content-border-color)" />
      <rect x="89" y="60" width="28" height="3" rx="1" fill="var(--p-text-color)" opacity="0.4" />
      <rect x="89" y="66" width="28" height="3" rx="1" fill="var(--p-text-color)" opacity="0.4" />
      <circle class="led" cx="93" cy="90" r="2.5" fill="var(--ng-danger)" />
      <text x="105" y="86" font-size="11" font-family="monospace" text-anchor="middle" fill="var(--p-text-color)">x_x</text>
    </g>
  </svg>
</template>

<style scoped>
.redcard {
  width: 320px;
  max-width: 82vw;
  height: auto;
  filter: drop-shadow(0 10px 30px rgba(120, 90, 220, 0.28));
}
.card {
  transform-box: fill-box;
  transform-origin: 50% 100%;
  animation: raise 2.6s ease-in-out infinite;
}
@keyframes raise {
  0% { transform: translateY(16px) scaleY(0); }
  22% { transform: translateY(0) scaleY(1); }
  78% { transform: translateY(0) scaleY(1); filter: none; }
  90% { transform: translateY(0) scaleY(1); filter: brightness(1.45); }
  100% { transform: translateY(0) scaleY(1); filter: none; }
}
.arm {
  transform-box: fill-box;
  transform-origin: 0% 50%;
  animation: armraise 2.6s ease-in-out infinite;
}
@keyframes armraise {
  0% { transform: rotate(22deg); }
  22%, 100% { transform: rotate(-10deg); }
}
.server { animation: glitch 2.6s steps(1) infinite; }
@keyframes glitch {
  0%, 84% { transform: translate(0, 0); filter: none; }
  86% { transform: translate(-2px, 1px); }
  88% { transform: translate(2px, -1px); filter: hue-rotate(50deg); }
  90% { transform: translate(-1px, 0); }
  92%, 100% { transform: translate(0, 0); filter: none; }
}
.led { animation: blink 1s steps(1) infinite; }
@keyframes blink { 0%, 60% { opacity: 1; } 61%, 100% { opacity: 0.25; } }
@media (prefers-reduced-motion: reduce) {
  .card, .arm, .server, .led { animation: none; }
  .card { transform: none; }
  .arm { transform: rotate(-10deg); }
}
</style>
