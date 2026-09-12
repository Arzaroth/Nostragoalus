<script setup lang="ts">
// The rugby variant of the default mark: same crystal ball, same pedestal, a
// rugby ball in place of the football. Shown when the competition in the URL is
// played at rugby union (a skin still wins - that is a deliberate unlock).
//
// Everything sits inside one rotate(-20 340 275) so the ball reads as one in
// flight rather than an egg on a shelf. The orb is centred on that same point,
// so rotating the group leaves the disc and its ring untouched.
</script>

<template>
  <svg viewBox="220 150 240 320" class="logo-mark" aria-hidden="true">
    <defs>
      <radialGradient id="lmr-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#a99bff" stop-opacity="0.85" />
        <stop offset="55%" stop-color="#6a5fd0" stop-opacity="0.32" />
        <stop offset="100%" stop-color="#6a5fd0" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="lmr-orb" cx="42%" cy="38%" r="70%">
        <stop offset="0%" stop-color="#f5f2ff" stop-opacity="0.97" />
        <stop offset="40%" stop-color="#beb3f6" stop-opacity="0.82" />
        <stop offset="78%" stop-color="#7e71d8" stop-opacity="0.45" />
        <stop offset="100%" stop-color="#5a4fb2" stop-opacity="0.18" />
      </radialGradient>
    </defs>

    <circle cx="340" cy="275" r="112" fill="url(#lmr-glow)" />
    <circle cx="340" cy="275" r="105" fill="url(#lmr-orb)" stroke="#f4d488" stroke-width="1.5" stroke-opacity="0.5" />

    <g transform="rotate(-20 340 275)">
      <!-- Paint-bucket sections: the orb ring, then the ball either side of its
           seam. Transparent until hovered, like the football's panels. -->
      <g class="lm-sections" fill="#f4d488">
        <path
          class="sec sec-ring"
          fill-rule="evenodd"
          d="M340 170 A105 105 0 1 0 340.01 170 Z M278 275 A62 38 0 1 0 402 275 A62 38 0 1 0 278 275 Z"
        />
        <path class="sec sec-1" d="M278 275 A62 38 0 0 1 402 275 Z" />
        <path class="sec sec-2" d="M278 275 A62 38 0 0 0 402 275 Z" />
      </g>

      <!-- constellation lines + nodes (static) -->
      <g stroke="#f4d488" stroke-width="1.3" fill="none" opacity="0.85">
        <polygon points="340,217 414.5,246 414.5,304 340,333 265.5,304 265.5,246" />
        <line x1="340" y1="237" x2="340" y2="217" />
        <line x1="393.7" y1="256" x2="414.5" y2="246" />
        <line x1="393.7" y1="294" x2="414.5" y2="304" />
        <line x1="340" y1="313" x2="340" y2="333" />
        <line x1="286.3" y1="294" x2="265.5" y2="304" />
        <line x1="286.3" y1="256" x2="265.5" y2="246" />
        <ellipse cx="340" cy="275" rx="62" ry="38" fill="#0e1538" fill-opacity="0.85" stroke-width="1.5" />
      </g>

      <!-- seam and lacing -->
      <g stroke="#f4d488" stroke-width="1.2" opacity="0.75">
        <line x1="292" y1="275" x2="388" y2="275" />
        <line x1="317" y1="267" x2="317" y2="283" />
        <line x1="331" y1="267" x2="331" y2="283" />
        <line x1="345" y1="267" x2="345" y2="283" />
        <line x1="359" y1="267" x2="359" y2="283" />
      </g>

      <g fill="#f4d488">
        <circle cx="340" cy="217" r="3.4" /><circle cx="414.5" cy="246" r="3.4" /><circle cx="414.5" cy="304" r="3.4" />
        <circle cx="340" cy="333" r="3.4" /><circle cx="265.5" cy="304" r="3.4" /><circle cx="265.5" cy="246" r="3.4" />
        <circle cx="340" cy="217" r="1.3" fill="#fff" /><circle cx="414.5" cy="246" r="1.3" fill="#fff" /><circle cx="414.5" cy="304" r="1.3" fill="#fff" />
        <circle cx="340" cy="333" r="1.3" fill="#fff" /><circle cx="265.5" cy="304" r="1.3" fill="#fff" /><circle cx="265.5" cy="246" r="1.3" fill="#fff" />
      </g>
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

<!-- Same rules LogoDefault carries, repeated rather than inherited: they are
     global (Vue's scoped compiler mangles ":global(ancestor) .child"), so
     leaning on LogoDefault's copy would work only for as long as something
     keeps importing it - and a rugby competition renders this mark alone.
     Identical selectors, so the duplication is idempotent. -->
<style>
.logo-mark .sec {
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: visible;
}
.logo-mark .sec:hover {
  opacity: 0.6;
  transition-duration: 0.12s;
}
.logo-mark .sec-ring:hover {
  opacity: 0.3;
}
.logo-mark .lm-sections ~ g {
  pointer-events: none;
}
</style>
