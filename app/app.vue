<script setup lang="ts">
// Pages set a short title via useHead; suffix it with the app name. Pages
// without one (or the default) just show 'Nostragoalus' - no dangling " · ".
useHead({
  titleTemplate: (title) => (title && title !== 'Nostragoalus' ? `${title} · Nostragoalus` : 'Nostragoalus'),
})

// The konami code listens app-wide and unlocks the cosmetic skins.
useKonamiUnlock()
</script>

<template>
  <NuxtPwaManifest />
  <NuxtLoadingIndicator :height="3" color="var(--p-primary-color)" />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <UpdateBanner />
  <SkinUnlockCelebration />
</template>
