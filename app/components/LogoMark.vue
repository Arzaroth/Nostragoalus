<script setup lang="ts">
// The crystal ball extracted from the full emblem (no cosmic disc, no
// pedestal), inlined so each part can glow on hover, GitLab-fox style:
// glow -> orb -> constellation -> nodes -> shine, staggered.
</script>

<template>
  <svg viewBox="225 160 230 230" class="logo-mark" aria-hidden="true">
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
    <circle class="lp lp-halo" cx="340" cy="275" r="112" fill="url(#lm-glow)" />
    <circle class="lp lp-orb" cx="340" cy="275" r="105" fill="url(#lm-orb)" stroke="#f4d488" stroke-width="1.5" stroke-opacity="0.5" />
    <g class="lp lp-net" stroke="#f4d488" stroke-width="1.3" fill="none" opacity="0.85">
      <polygon points="340,197 414.2,250.9 385.8,338.1 294.2,338.1 265.8,250.9" />
      <line x1="340" y1="237" x2="340" y2="197" />
      <line x1="376.1" y1="263.3" x2="414.2" y2="250.9" />
      <line x1="362.3" y1="305.7" x2="385.8" y2="338.1" />
      <line x1="317.7" y1="305.7" x2="294.2" y2="338.1" />
      <line x1="303.9" y1="263.3" x2="265.8" y2="250.9" />
      <polygon points="340,237 376.1,263.3 362.3,305.7 317.7,305.7 303.9,263.3" fill="#0e1538" fill-opacity="0.85" stroke-width="1.5" />
    </g>
    <g class="lp lp-nodes" fill="#f4d488">
      <circle cx="340" cy="197" r="3.4" /><circle cx="414.2" cy="250.9" r="3.4" /><circle cx="385.8" cy="338.1" r="3.4" /><circle cx="294.2" cy="338.1" r="3.4" /><circle cx="265.8" cy="250.9" r="3.4" />
      <circle cx="340" cy="197" r="1.3" fill="#fff" /><circle cx="414.2" cy="250.9" r="1.3" fill="#fff" /><circle cx="385.8" cy="338.1" r="1.3" fill="#fff" /><circle cx="294.2" cy="338.1" r="1.3" fill="#fff" /><circle cx="265.8" cy="250.9" r="1.3" fill="#fff" />
      <circle cx="340" cy="237" r="2.3" /><circle cx="376.1" cy="263.3" r="2.3" /><circle cx="362.3" cy="305.7" r="2.3" /><circle cx="317.7" cy="305.7" r="2.3" /><circle cx="303.9" cy="263.3" r="2.3" />
    </g>
    <g class="lp lp-shine" fill="#fff">
      <ellipse cx="312" cy="242" rx="30" ry="15" opacity="0.16" />
      <circle cx="300" cy="232" r="4" opacity="0.5" />
    </g>
  </svg>
</template>

<style scoped>
.logo-mark {
  display: block;
  overflow: visible;
}
.lp {
  transition: filter 0.3s ease, opacity 0.3s ease;
}
/* staggered glow when the wrapping link is hovered */
:global(.logo-home:hover) .lp-halo {
  filter: brightness(1.8);
  transition-delay: 0s;
}
:global(.logo-home:hover) .lp-orb {
  filter: drop-shadow(0 0 7px rgba(169, 155, 255, 0.9)) brightness(1.25);
  transition-delay: 0.06s;
}
:global(.logo-home:hover) .lp-net {
  filter: drop-shadow(0 0 4px rgba(244, 212, 136, 0.95)) brightness(1.5);
  transition-delay: 0.14s;
}
:global(.logo-home:hover) .lp-nodes {
  filter: drop-shadow(0 0 5px rgba(244, 212, 136, 1)) brightness(1.7);
  transition-delay: 0.22s;
}
:global(.logo-home:hover) .lp-shine {
  filter: brightness(2);
  opacity: 1.5;
  transition-delay: 0.3s;
}
</style>
