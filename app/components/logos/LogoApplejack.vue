<script setup lang="ts">
// Applejack skin: orange orb, blonde mane, and her three-apples cutie mark.
</script>

<template>
  <svg viewBox="220 150 240 320" class="logo-mark" aria-hidden="true">
    <defs>
      <radialGradient id="aj-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ffc480" stop-opacity="0.85" />
        <stop offset="60%" stop-color="#ef9a3a" stop-opacity="0.3" />
        <stop offset="100%" stop-color="#ef9a3a" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="aj-orb" cx="40%" cy="36%" r="72%">
        <stop offset="0%" stop-color="#fff2dc" />
        <stop offset="48%" stop-color="#f7c081" />
        <stop offset="100%" stop-color="#ef9a3a" />
      </radialGradient>
      <clipPath id="aj-clip"><circle cx="340" cy="275" r="105" /></clipPath>
    </defs>

    <circle cx="340" cy="275" r="112" fill="url(#aj-glow)" />
    <circle cx="340" cy="275" r="105" fill="url(#aj-orb)" stroke="#bf6f1f" stroke-width="2" stroke-opacity="0.55" />

    <!-- mane: blonde sweep over the crown -->
    <g clip-path="url(#aj-clip)">
      <path d="M236 252 Q300 158 432 196 Q360 214 318 272 Q282 232 236 252Z" fill="#f4d77a" />
      <path d="M252 246 Q312 184 416 204 Q352 220 322 262 Q294 234 252 246Z" fill="#fbe9a8" opacity="0.7" />
      <path d="M250 250 Q270 246 286 256" fill="none" stroke="#d9b656" stroke-width="3" stroke-linecap="round" />
      <path d="M360 210 Q380 210 398 222" fill="none" stroke="#d9b656" stroke-width="3" stroke-linecap="round" />
    </g>

    <ellipse cx="312" cy="242" rx="28" ry="14" fill="#fff" opacity="0.2" />
    <circle cx="302" cy="234" r="4.5" fill="#fff" opacity="0.6" />

    <!-- cutie mark: three apples -->
    <g>
      <g>
        <path d="M320 268 q-2 -4 -7 -3" fill="none" stroke="#7a4a26" stroke-width="3" stroke-linecap="round" />
        <path d="M320 263 q6 -8 16 -6 q-2 8 -12 9Z" fill="#5bbf4a" />
        <path d="M320 270 C306 258 304 282 320 296 C336 282 334 258 320 270Z" fill="#e23b2e" />
        <ellipse cx="313" cy="278" rx="3.5" ry="5" fill="#fff" opacity="0.5" />
      </g>
      <g>
        <path d="M360 264 q-2 -4 -7 -3" fill="none" stroke="#7a4a26" stroke-width="3" stroke-linecap="round" />
        <path d="M360 259 q6 -8 16 -6 q-2 8 -12 9Z" fill="#5bbf4a" />
        <path d="M360 266 C346 254 344 278 360 292 C376 278 374 254 360 266Z" fill="#e23b2e" />
        <ellipse cx="353" cy="274" rx="3.5" ry="5" fill="#fff" opacity="0.5" />
      </g>
      <g>
        <path d="M340 296 q-2 -4 -7 -3" fill="none" stroke="#7a4a26" stroke-width="3" stroke-linecap="round" />
        <path d="M340 291 q6 -8 16 -6 q-2 8 -12 9Z" fill="#5bbf4a" />
        <path d="M340 298 C326 286 324 310 340 324 C356 310 354 286 340 298Z" fill="#e23b2e" />
        <ellipse cx="333" cy="306" rx="3.5" ry="5" fill="#fff" opacity="0.5" />
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
