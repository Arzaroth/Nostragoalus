<script setup lang="ts">
// Twilight Sparkle skin: lavender orb, indigo mane streaked magenta, her
// six-pointed sparkle cutie mark at the core.
</script>

<template>
  <svg viewBox="220 150 240 320" class="logo-mark" aria-hidden="true">
    <defs>
      <radialGradient id="tw-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#b79bff" stop-opacity="0.85" />
        <stop offset="60%" stop-color="#7a5fd0" stop-opacity="0.3" />
        <stop offset="100%" stop-color="#7a5fd0" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="tw-orb" cx="40%" cy="36%" r="72%">
        <stop offset="0%" stop-color="#f0e9ff" />
        <stop offset="48%" stop-color="#c9b6f0" />
        <stop offset="100%" stop-color="#8f74d6" />
      </radialGradient>
      <clipPath id="tw-clip"><circle cx="340" cy="275" r="105" /></clipPath>
    </defs>

    <circle cx="340" cy="275" r="112" fill="url(#tw-glow)" />
    <circle cx="340" cy="275" r="105" fill="url(#tw-orb)" stroke="#4a2f8f" stroke-width="2" stroke-opacity="0.55" />

    <!-- mane: indigo sweep with a magenta and purple streak over the crown -->
    <g clip-path="url(#tw-clip)">
      <path d="M235 250 Q300 150 430 200 Q360 215 320 270 Q280 230 235 250Z" fill="#3a2f7a" />
      <path d="M250 244 Q310 175 420 205 Q355 220 322 262 Q292 232 250 244Z" fill="#e84fa0" opacity="0.9" />
      <path d="M262 240 Q318 188 408 210 Q352 224 326 256 Q300 236 262 240Z" fill="#6c4fd0" opacity="0.85" />
    </g>

    <ellipse cx="312" cy="240" rx="30" ry="15" fill="#fff" opacity="0.2" />
    <circle cx="301" cy="231" r="4.5" fill="#fff" opacity="0.6" />

    <!-- cutie mark: six-point star (hexagram) + attendant sparkles -->
    <g>
      <polygon points="340,231 381,302 299,302" fill="#e0409a" />
      <polygon points="340,319 381,248 299,248" fill="#e0409a" />
      <polygon points="340,243 366,288 314,288" fill="#f7a8d6" opacity="0.65" />
      <g fill="#ffffff">
        <path d="M300 233 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3Z" />
        <path d="M388 244 l2.4 6.4 6.4 2.4 -6.4 2.4 -2.4 6.4 -2.4 -6.4 -6.4 -2.4 6.4 -2.4Z" />
        <path d="M376 320 l2.4 6.4 6.4 2.4 -6.4 2.4 -2.4 6.4 -2.4 -6.4 -6.4 -2.4 6.4 -2.4Z" />
        <path d="M308 322 l2 5.6 5.6 2 -5.6 2 -2 5.6 -2 -5.6 -5.6 -2 5.6 -2Z" />
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
