<script setup lang="ts">
// Rarity skin: pearl-white orb, royal-purple curled mane, and her trio of
// blue diamonds cutie mark.
</script>

<template>
  <svg viewBox="220 150 240 320" class="logo-mark" aria-hidden="true">
    <defs>
      <radialGradient id="ra-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#d9b6ff" stop-opacity="0.8" />
        <stop offset="60%" stop-color="#a06fd0" stop-opacity="0.28" />
        <stop offset="100%" stop-color="#a06fd0" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="ra-orb" cx="40%" cy="36%" r="72%">
        <stop offset="0%" stop-color="#ffffff" />
        <stop offset="52%" stop-color="#efeafb" />
        <stop offset="100%" stop-color="#d6cdef" />
      </radialGradient>
      <linearGradient id="ra-gem" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#bfe2fb" />
        <stop offset="100%" stop-color="#5aa0e0" />
      </linearGradient>
      <clipPath id="ra-clip"><circle cx="340" cy="275" r="105" /></clipPath>
    </defs>

    <circle cx="340" cy="275" r="112" fill="url(#ra-glow)" />
    <circle cx="340" cy="275" r="105" fill="url(#ra-orb)" stroke="#7e5fb0" stroke-width="2" stroke-opacity="0.5" />

    <!-- mane: sculpted royal-purple curl over the crown -->
    <g clip-path="url(#ra-clip)">
      <path d="M236 256 Q280 168 372 188 Q418 196 430 246 Q402 214 360 214 Q300 214 320 274 Q286 232 236 256Z" fill="#5b3f9e" />
      <path d="M252 250 Q292 192 360 202 Q336 210 326 244 Q300 224 252 250Z" fill="#7a5cc0" opacity="0.75" />
      <path d="M404 220 Q420 232 420 252" fill="none" stroke="#4a3186" stroke-width="3" stroke-linecap="round" />
    </g>

    <ellipse cx="312" cy="240" rx="30" ry="15" fill="#fff" opacity="0.35" />
    <circle cx="301" cy="231" r="4.5" fill="#fff" opacity="0.7" />

    <!-- cutie mark: three diamonds -->
    <g stroke="#ffffff" stroke-width="1.4" stroke-linejoin="round">
      <g>
        <polygon points="322,250 337,262 322,288 307,262" fill="url(#ra-gem)" />
        <polygon points="322,250 337,262 322,266 307,262" fill="#e6f3fd" opacity="0.85" stroke="none" />
      </g>
      <g>
        <polygon points="360,246 375,258 360,284 345,258" fill="url(#ra-gem)" />
        <polygon points="360,246 375,258 360,262 345,258" fill="#e6f3fd" opacity="0.85" stroke="none" />
      </g>
      <g>
        <polygon points="341,282 356,294 341,320 326,294" fill="url(#ra-gem)" />
        <polygon points="341,282 356,294 341,298 326,294" fill="#e6f3fd" opacity="0.85" stroke="none" />
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
