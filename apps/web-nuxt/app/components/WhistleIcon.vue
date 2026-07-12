<script setup lang="ts">
// Referee whistle for play-by-play foul lines (no whistle exists in the emoji
// set). Material Design Icons' "whistle" (Apache-2.0), inheriting the row colour
// via currentColor and sized to the surrounding font (1em) so it drops in where
// the emoji was.
</script>

<template>
  <svg viewBox="0 0 24 24" width="1em" height="1em" class="whistle-icon" role="img" aria-hidden="true">
    <path
      fill="currentColor"
      d="M8.5 9A6.5 6.5 0 0 0 2 15.5A6.5 6.5 0 0 0 8.5 22a6.5 6.5 0 0 0 6.5-6.5v-1.59L22 12V9H11v2H9V9zM11 2v5H9V2zM6.35 7.28q-1.005.24-1.92.72L2.14 4.88L3.76 3.7zm11.51-2.4L16.32 7h-2.47l2.39-3.3z"
    />
  </svg>
</template>

<style scoped>
.whistle-icon {
  display: inline-block;
  vertical-align: -0.18em;
  overflow: visible;
}
</style>
