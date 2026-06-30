<script setup lang="ts">
// Pages set a short title via useHead; suffix it with the app name. Pages
// without one (or the default) just show 'Nostragoalus' - no dangling " · ".
// Mirror the active skin onto <html data-skin> on the server too (it's read
// from the cookie), so the skin palette + logo are correct on the first paint.
const { skin } = useSkin()
// The active locale drives <html lang> and, for Arabic, <html dir="rtl">. Bind both
// straight off the locale object: its code/language/dir all ride the SSR payload, so
// server and client agree. (useLocaleHead emits dir only on the server, so it gets
// dropped on hydration - the attribute flips off after first paint.)
const { locale, locales } = useI18n()
const activeLocale = computed(() =>
  (locales.value as { code: string; language?: string; dir?: 'ltr' | 'rtl' | 'auto' }[]).find((l) => l.code === locale.value),
)
useHead({
  titleTemplate: (title) => (title && title !== 'Nostragoalus' ? `${title} · Nostragoalus` : 'Nostragoalus'),
  htmlAttrs: {
    'data-skin': computed(() => skin.value || undefined),
    lang: computed(() => activeLocale.value?.language ?? locale.value),
    dir: computed(() => activeLocale.value?.dir ?? 'ltr'),
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
