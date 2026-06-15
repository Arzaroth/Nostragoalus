<script setup lang="ts">
// Pages set a short title via useHead; suffix it with the app name. Pages
// without one (or the default) just show 'Nostragoalus' - no dangling " · ".
// Mirror the active skin onto <html data-skin> on the server too (it's read
// from the cookie), so the skin palette + logo are correct on the first paint.
const { skin } = useSkin()
useHead({
  titleTemplate: (title) => (title && title !== 'Nostragoalus' ? `${title} · Nostragoalus` : 'Nostragoalus'),
  htmlAttrs: { 'data-skin': computed(() => skin.value || undefined) },
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
