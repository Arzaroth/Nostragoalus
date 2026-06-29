<script setup lang="ts">
// Pages set a short title via useHead; suffix it with the app name. Pages
// without one (or the default) just show 'Nostragoalus' - no dangling " · ".
// Mirror the active skin onto <html data-skin> on the server too (it's read
// from the cookie), so the skin palette + logo are correct on the first paint.
const { skin } = useSkin()
// The active locale drives <html lang> and, for Arabic, <html dir="rtl"> - both
// must be right on the server's first paint so RTL doesn't flip in after hydration.
const i18nHead = useLocaleHead()
useHead({
  titleTemplate: (title) => (title && title !== 'Nostragoalus' ? `${title} · Nostragoalus` : 'Nostragoalus'),
  htmlAttrs: {
    'data-skin': computed(() => skin.value || undefined),
    lang: computed(() => i18nHead.value.htmlAttrs?.lang),
    dir: computed(() => i18nHead.value.htmlAttrs?.dir as 'ltr' | 'rtl' | 'auto' | undefined),
  },
  // Preload the active skin's banner head so it's ready on first paint instead
  // of popping in after the raster loads.
  link: computed(() => (skin.value ? [{ rel: 'preload', as: 'image', href: `/skins/${skin.value}.png` }] : [])),
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
  <PwaBanner />
  <SkinUnlockCelebration />
</template>
