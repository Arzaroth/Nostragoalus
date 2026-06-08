<script setup lang="ts">
// The crystal ball + pedestal extracted from the emblem (no cosmic disc),
// inlined so each SECTION of the ball glows gold when hovered individually
// (GitLab-fox style): the five panels, the core pentagon, and the outer ring
// of the orb around the constellation.
</script>

<template>
  <svg viewBox="220 150 240 320" class="logo-mark" aria-hidden="true">
    <defs>
      <radialGradient id="lm-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#a99bff" stop-opacity="0.85" />
        <stop offset="55%" stop-color="#6a5fd0" stop-opacity="0.32" />
        <stop offset="100%" stop-color="#6a5fd0" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="lm-orb" cx="42%" cy="38%" r="70%">
        <stop offset="0%" stop-color="#f5f2ff" stop-opacity="0.97" />
        <stop offset="40%" stop-color="#beb3f6" stop-opacity="0.82" />
        <stop offset="78%" stop-color="#7e71d8" stop-opacity="0.45" />
        <stop offset="100%" stop-color="#5a4fb2" stop-opacity="0.18" />
      </radialGradient>
    </defs>

    <circle cx="340" cy="275" r="112" fill="url(#lm-glow)" />
    <circle cx="340" cy="275" r="105" fill="url(#lm-orb)" stroke="#f4d488" stroke-width="1.5" stroke-opacity="0.5" />

    <!-- The football's sections: five outer panels + the core pentagon.
         Transparent by default; they fill gold one after another on hover. -->
    <g class="lm-sections" fill="#f4d488">
      <!-- the orb's outer ring: the disc minus the constellation pentagon -->
      <path
        class="sec sec-ring"
        fill-rule="evenodd"
        d="M340 170 A105 105 0 1 0 340.01 170 Z M340 197 L414.2 250.9 L385.8 338.1 L294.2 338.1 L265.8 250.9 Z"
      />
      <polygon class="sec sec-1" points="340,197 414.2,250.9 376.1,263.3 340,237" />
      <polygon class="sec sec-2" points="414.2,250.9 385.8,338.1 362.3,305.7 376.1,263.3" />
      <polygon class="sec sec-3" points="385.8,338.1 294.2,338.1 317.7,305.7 362.3,305.7" />
      <polygon class="sec sec-4" points="294.2,338.1 265.8,250.9 303.9,263.3 317.7,305.7" />
      <polygon class="sec sec-5" points="265.8,250.9 340,197 340,237 303.9,263.3" />
      <polygon class="sec sec-core" points="340,237 376.1,263.3 362.3,305.7 317.7,305.7 303.9,263.3" />
    </g>

    <!-- constellation lines + nodes (static) -->
    <g stroke="#f4d488" stroke-width="1.3" fill="none" opacity="0.85">
      <polygon points="340,197 414.2,250.9 385.8,338.1 294.2,338.1 265.8,250.9" />
      <line x1="340" y1="237" x2="340" y2="197" />
      <line x1="376.1" y1="263.3" x2="414.2" y2="250.9" />
      <line x1="362.3" y1="305.7" x2="385.8" y2="338.1" />
      <line x1="317.7" y1="305.7" x2="294.2" y2="338.1" />
      <line x1="303.9" y1="263.3" x2="265.8" y2="250.9" />
      <polygon points="340,237 376.1,263.3 362.3,305.7 317.7,305.7 303.9,263.3" fill="#0e1538" fill-opacity="0.85" stroke-width="1.5" />
    </g>
    <g fill="#f4d488">
      <circle cx="340" cy="197" r="3.4" /><circle cx="414.2" cy="250.9" r="3.4" /><circle cx="385.8" cy="338.1" r="3.4" /><circle cx="294.2" cy="338.1" r="3.4" /><circle cx="265.8" cy="250.9" r="3.4" />
      <circle cx="340" cy="197" r="1.3" fill="#fff" /><circle cx="414.2" cy="250.9" r="1.3" fill="#fff" /><circle cx="385.8" cy="338.1" r="1.3" fill="#fff" /><circle cx="294.2" cy="338.1" r="1.3" fill="#fff" /><circle cx="265.8" cy="250.9" r="1.3" fill="#fff" />
      <circle cx="340" cy="237" r="2.3" /><circle cx="376.1" cy="263.3" r="2.3" /><circle cx="362.3" cy="305.7" r="2.3" /><circle cx="317.7" cy="305.7" r="2.3" /><circle cx="303.9" cy="263.3" r="2.3" />
    </g>
    <g fill="#fff">
      <ellipse cx="312" cy="242" rx="30" ry="15" opacity="0.16" />
      <circle cx="300" cy="232" r="4" opacity="0.5" />
    </g>

    <!-- pedestal -->
    <g>
      <ellipse cx="340" cy="384" rx="64" ry="15" fill="none" stroke="#e8b75a" stroke-width="3" />
      <path d="M281 380 C 269 372, 270 356, 283 350" fill="none" stroke="#e8b75a" stroke-width="2.4" />
      <path d="M399 380 C 411 372, 410 356, 397 350" fill="none" stroke="#e8b75a" stroke-width="2.4" />
      <path d="M333 394 Q340 396 347 394 L350 448 Q340 452 330 448 Z" fill="#e8b75a" />
      <circle cx="340" cy="418" r="7.5" fill="#f4d488" stroke="#b8862f" stroke-width="1" />
      <ellipse cx="340" cy="458" rx="50" ry="12" fill="#e8b75a" />
      <ellipse cx="340" cy="452" rx="40" ry="8" fill="none" stroke="#b8862f" stroke-width="1.3" opacity="0.7" />
      <ellipse cx="340" cy="458" rx="50" ry="12" fill="none" stroke="#f4d488" stroke-width="0.9" opacity="0.6" />
    </g>
  </svg>
</template>

<style scoped>
.logo-mark {
  display: block;
  overflow: visible;
}
</style>

<!-- Unscoped on purpose: Vue's scoped compiler mangles
     ":global(ancestor) .child" selectors (drops the child part). -->
<style>
.logo-mark .sec {
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: visible; /* hover works even while transparent */
}
/* each section glows when YOU touch it, paint-bucket style */
.logo-mark .sec:hover {
  opacity: 0.6;
  transition-duration: 0.12s;
}
.logo-mark .sec-core:hover {
  opacity: 0.85;
}
.logo-mark .sec-ring:hover {
  opacity: 0.3; /* the big ring stays subtle so it doesn't swallow the orb */
}
/* the decorative layers above the sections must not steal the hover */
.logo-mark .lm-sections ~ g {
  pointer-events: none;
}
</style>
