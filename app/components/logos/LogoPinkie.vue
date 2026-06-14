<script setup lang="ts">
// Pinkie Pie skin: bubblegum-pink orb, curly magenta mane, and her trio of
// balloons cutie mark.
</script>

<template>
  <svg viewBox="220 150 240 320" class="logo-mark" aria-hidden="true">
    <defs>
      <radialGradient id="pp-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ffa9d6" stop-opacity="0.85" />
        <stop offset="60%" stop-color="#ef7ab8" stop-opacity="0.3" />
        <stop offset="100%" stop-color="#ef7ab8" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="pp-orb" cx="40%" cy="36%" r="72%">
        <stop offset="0%" stop-color="#fff0f8" />
        <stop offset="48%" stop-color="#f7c0dd" />
        <stop offset="100%" stop-color="#ef8fc2" />
      </radialGradient>
      <clipPath id="pp-clip"><circle cx="340" cy="275" r="105" /></clipPath>
    </defs>

    <circle cx="340" cy="275" r="112" fill="url(#pp-glow)" />
    <circle cx="340" cy="275" r="105" fill="url(#pp-orb)" stroke="#c64f93" stroke-width="2" stroke-opacity="0.55" />

    <!-- mane: bouncy magenta curls across the crown -->
    <g clip-path="url(#pp-clip)" fill="#e8489a">
      <circle cx="262" cy="244" r="30" />
      <circle cx="304" cy="218" r="34" />
      <circle cx="352" cy="212" r="32" />
      <circle cx="398" cy="232" r="28" />
      <circle cx="424" cy="262" r="24" />
    </g>
    <g clip-path="url(#pp-clip)" fill="#f49ac8" opacity="0.7">
      <circle cx="300" cy="214" r="13" />
      <circle cx="350" cy="208" r="12" />
      <circle cx="396" cy="230" r="10" />
    </g>

    <ellipse cx="312" cy="244" rx="28" ry="14" fill="#fff" opacity="0.22" />
    <circle cx="302" cy="236" r="4.5" fill="#fff" opacity="0.6" />

    <!-- cutie mark: three balloons with strings -->
    <g>
      <path d="M321 274 Q330 300 340 332" fill="none" stroke="#caa24a" stroke-width="1.6" />
      <path d="M360 270 Q352 302 340 332" fill="none" stroke="#caa24a" stroke-width="1.6" />
      <path d="M340 300 L340 332" fill="none" stroke="#caa24a" stroke-width="1.6" />
      <g>
        <ellipse cx="320" cy="252" rx="20" ry="24" fill="#ffd84a" />
        <polygon points="320,275 315,282 325,282" fill="#ffd84a" />
        <ellipse cx="313" cy="244" rx="5" ry="7" fill="#fff" opacity="0.55" />
      </g>
      <g>
        <ellipse cx="361" cy="248" rx="20" ry="24" fill="#7ec8f0" />
        <polygon points="361,271 356,278 366,278" fill="#7ec8f0" />
        <ellipse cx="354" cy="240" rx="5" ry="7" fill="#fff" opacity="0.55" />
      </g>
      <g>
        <ellipse cx="340" cy="284" rx="20" ry="24" fill="#7ec8f0" />
        <polygon points="340,307 335,314 345,314" fill="#7ec8f0" />
        <ellipse cx="333" cy="276" rx="5" ry="7" fill="#fff" opacity="0.55" />
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
