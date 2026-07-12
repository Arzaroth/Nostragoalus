<script setup lang="ts">
// Fluttershy skin: butter-yellow orb, soft pink mane, and her three
// butterflies cutie mark.
</script>

<template>
  <svg viewBox="220 150 240 320" class="logo-mark" aria-hidden="true">
    <defs>
      <radialGradient id="fs-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#fff39a" stop-opacity="0.85" />
        <stop offset="60%" stop-color="#f3df5c" stop-opacity="0.3" />
        <stop offset="100%" stop-color="#f3df5c" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="fs-orb" cx="40%" cy="36%" r="72%">
        <stop offset="0%" stop-color="#fffdea" />
        <stop offset="48%" stop-color="#fbf0a0" />
        <stop offset="100%" stop-color="#f3e25c" />
      </radialGradient>
      <clipPath id="fs-clip"><circle cx="340" cy="275" r="105" /></clipPath>
    </defs>

    <circle cx="340" cy="275" r="112" fill="url(#fs-glow)" />
    <circle cx="340" cy="275" r="105" fill="url(#fs-orb)" stroke="#cdab2f" stroke-width="2" stroke-opacity="0.5" />

    <!-- mane: soft pink waves draping the crown -->
    <g clip-path="url(#fs-clip)">
      <path d="M236 258 Q280 170 372 190 Q420 200 432 256 Q420 300 404 340 Q398 286 360 262 Q300 226 320 286 Q284 236 236 258Z" fill="#f6a8c8" />
      <path d="M250 254 Q294 196 362 206 Q336 214 326 250 Q300 228 250 254Z" fill="#fbc7dd" opacity="0.7" />
      <path d="M408 262 Q418 296 404 332" fill="none" stroke="#e588b0" stroke-width="3" stroke-linecap="round" />
    </g>

    <ellipse cx="312" cy="242" rx="28" ry="14" fill="#fff" opacity="0.25" />
    <circle cx="302" cy="234" r="4.5" fill="#fff" opacity="0.6" />

    <!-- cutie mark: three butterflies -->
    <g>
      <g transform="translate(322 264)">
        <path d="M0 0 C-16 -14 -22 4 -3 9 C-14 16 -1 22 0 6 C1 22 14 16 3 9 C22 4 16 -14 0 0Z" fill="#f48fc0" stroke="#e06fa6" stroke-width="1.2" />
        <path d="M-3 9 C-12 14 -2 19 0 8 C2 19 12 14 3 9Z" fill="#fbe07a" />
        <line x1="0" y1="-4" x2="0" y2="10" stroke="#6b4a2a" stroke-width="1.6" />
      </g>
      <g transform="translate(360 258) scale(0.92)">
        <path d="M0 0 C-16 -14 -22 4 -3 9 C-14 16 -1 22 0 6 C1 22 14 16 3 9 C22 4 16 -14 0 0Z" fill="#f48fc0" stroke="#e06fa6" stroke-width="1.2" />
        <path d="M-3 9 C-12 14 -2 19 0 8 C2 19 12 14 3 9Z" fill="#fbe07a" />
        <line x1="0" y1="-4" x2="0" y2="10" stroke="#6b4a2a" stroke-width="1.6" />
      </g>
      <g transform="translate(341 294)">
        <path d="M0 0 C-16 -14 -22 4 -3 9 C-14 16 -1 22 0 6 C1 22 14 16 3 9 C22 4 16 -14 0 0Z" fill="#f48fc0" stroke="#e06fa6" stroke-width="1.2" />
        <path d="M-3 9 C-12 14 -2 19 0 8 C2 19 12 14 3 9Z" fill="#fbe07a" />
        <line x1="0" y1="-4" x2="0" y2="10" stroke="#6b4a2a" stroke-width="1.6" />
      </g>
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
