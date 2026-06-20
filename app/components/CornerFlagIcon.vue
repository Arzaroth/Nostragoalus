<script setup lang="ts">
// Corner flag for play-by-play corner lines. The flag-on-post emoji (🚩) reads
// as a red warning and renders differently per platform, so a hand-drawn pennant
// on a pole (like WhistleIcon for fouls) inherits the row colour via currentColor
// and sizes to the surrounding font (1em).
</script>

<template>
  <svg viewBox="0 0 24 24" width="1em" height="1em" class="corner-flag-icon" role="img" aria-hidden="true">
    <path fill="currentColor" d="M6 3h1.6v18H6zM7.6 3 19 6.2 7.6 9.4z" />
  </svg>
</template>

<style scoped>
.corner-flag-icon {
  display: inline-block;
  vertical-align: -0.18em;
  overflow: visible;
}
</style>
