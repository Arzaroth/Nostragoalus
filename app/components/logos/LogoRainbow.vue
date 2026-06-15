<script setup lang="ts">
// Rainbow Dash skin: sky-blue orb, a rainbow-striped mane arc, and her
// cloud-and-lightning-bolt cutie mark.
</script>

<template>
  <svg viewBox="220 150 240 320" class="logo-mark" aria-hidden="true">
    <defs>
      <radialGradient id="rd-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#8fd4ff" stop-opacity="0.85" />
        <stop offset="60%" stop-color="#4aa8e8" stop-opacity="0.3" />
        <stop offset="100%" stop-color="#4aa8e8" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="rd-orb" cx="40%" cy="36%" r="72%">
        <stop offset="0%" stop-color="#eaf7ff" />
        <stop offset="48%" stop-color="#a9ddff" />
        <stop offset="100%" stop-color="#5bb0ef" />
      </radialGradient>
      <linearGradient id="rd-bolt" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#ff5a5a" />
        <stop offset="50%" stop-color="#ffd23f" />
        <stop offset="100%" stop-color="#3fb6ff" />
      </linearGradient>
      <clipPath id="rd-clip"><circle cx="340" cy="275" r="105" /></clipPath>
    </defs>

    <circle cx="340" cy="275" r="112" fill="url(#rd-glow)" />
    <circle cx="340" cy="275" r="105" fill="url(#rd-orb)" stroke="#2f7fc4" stroke-width="2" stroke-opacity="0.55" />

    <!-- mane: rainbow stripes sweeping over the crown -->
    <g clip-path="url(#rd-clip)" stroke-linecap="round" fill="none" stroke-width="9">
      <path d="M240 250 Q310 168 432 198" stroke="#e23b3b" />
      <path d="M243 260 Q312 180 430 209" stroke="#f08a2a" />
      <path d="M246 270 Q314 192 428 220" stroke="#f4d23f" />
      <path d="M249 280 Q316 204 426 231" stroke="#4bbf5a" />
      <path d="M252 290 Q318 216 424 242" stroke="#3f9be8" />
      <path d="M255 300 Q320 228 422 253" stroke="#8b5fd0" />
    </g>

    <ellipse cx="312" cy="240" rx="30" ry="15" fill="#fff" opacity="0.22" />
    <circle cx="301" cy="231" r="4.5" fill="#fff" opacity="0.6" />

    <!-- cutie mark: cloud + tri-colour lightning bolt -->
    <g>
      <g fill="#ffffff" stroke="#cfe6f5" stroke-width="1.5">
        <circle cx="312" cy="266" r="17" />
        <circle cx="334" cy="256" r="21" />
        <circle cx="357" cy="265" r="16" />
        <rect x="305" y="266" width="62" height="18" rx="9" stroke="none" />
      </g>
      <path d="M342 276 L366 276 L347 304 L370 304 L326 350 L340 314 L320 314 Z" fill="url(#rd-bolt)" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round" />
    </g>

    <!-- pedestal -->
    <g>
      <ellipse cx="340" cy="384" rx="62" ry="14" fill="none" stroke="#e8b75a" stroke-width="3" />
      <path d="M333 394 Q340 396 347 394 L350 448 Q340 452 330 448 Z" fill="#e8b75a" />
      <circle cx="340" cy="418" r="7" fill="#f4d488" stroke="#b8862f" stroke-width="1" />
      <ellipse cx="340" cy="458" rx="50" ry="12" fill="#e8b75a" />
      <ellipse cx="340" cy="452" rx="40" ry="8" fill="none" stroke="#b8862f" stroke-width="1.3" opacity="0.7" />
    </g>
  </svg>
</template>

<style scoped>
.logo-mark {
  display: block;
  overflow: visible;
}
</style>
