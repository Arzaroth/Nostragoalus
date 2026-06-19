<script setup lang="ts">
const { t, locale, locales, setLocale } = useI18n()
const config = useRuntimeConfig()
const nuxtApp = useNuxtApp()
const router = useRouter()
const { isDark, toggle } = useTheme()

// SSR pages ship their server render time in the payload; client-side
// navigations are timed here instead.
const pageMs = ref<number | null>((nuxtApp.payload as { renderMs?: number }).renderMs ?? null)
let navStart = 0
router.beforeEach(() => {
  navStart = performance.now()
})
router.afterEach(() => {
  if (!navStart) return
  const started = navStart
  void nextTick(() => {
    pageMs.value = Math.round(performance.now() - started)
  })
})

const lang = computed({
  get: () => locale.value,
  set: (v: string) => {
    void setLocale(v as 'en' | 'fr' | 'th' | 'tlh')
  },
})
</script>

<template>
  <footer
    class="border-t text-xs"
    style="border-color: var(--p-content-border-color); color: var(--p-text-muted-color); background: var(--p-content-background)"
  >
    <div class="mx-auto max-w-7xl px-4 sm:px-6 py-1 flex items-center justify-between gap-x-4 gap-y-1 flex-wrap">
      <div class="flex items-center gap-1">
        <span>{{ t('footer.version') }}:</span>
        <NuxtLink :to="`/about#v${config.public.version}`" class="hover:underline font-medium" style="color: var(--p-primary-color)">{{ config.public.version }}</NuxtLink>
        <ClientOnly><span v-if="pageMs != null" class="ml-2">{{ t('footer.page') }}: <b style="color: var(--p-text-color)">{{ pageMs }}ms</b></span></ClientOnly>
      </div>
      <div class="flex items-center gap-2">
        <Select
          v-model="lang"
          :options="locales"
          option-label="name"
          option-value="code"
          size="small"
          class="footer-select"
          :aria-label="t('prefs.language')"
        >
          <template #value="{ value }">
            <span class="inline-flex items-center gap-1 text-xs"><i class="pi pi-globe" style="font-size: 0.75rem" />{{ locales.find((l) => l.code === value)?.name }}</span>
          </template>
        </Select>
        <ClientOnly>
          <Button
            :icon="isDark ? 'pi pi-sun' : 'pi pi-moon'"
            text
            rounded
            severity="secondary"
            size="small"
            aria-label="Toggle theme"
            @click="toggle"
          />
          <template #fallback>
            <Button icon="pi pi-moon" text rounded severity="secondary" size="small" aria-label="Toggle theme" disabled />
          </template>
        </ClientOnly>
        <NuxtLink to="/roadmap" class="hover:underline">{{ t('roadmap.title') }}</NuxtLink>
        <NuxtLink to="/verify" class="hover:underline">{{ t('verify.title') }}</NuxtLink>
        <a href="/docs/api" target="_blank" rel="noopener" class="hover:underline">API</a>
      </div>
    </div>
  </footer>
</template>

<style scoped>
/* Text-like select: no box, just the value + chevron, sized for the footer. */
.footer-select {
  background: transparent;
  border: none;
  box-shadow: none;
}
.footer-select :deep(.p-select-label) {
  padding: 0.15rem 0.25rem;
  color: var(--p-text-muted-color);
}
.footer-select :deep(.p-select-dropdown) {
  width: 1.25rem;
  color: var(--p-text-muted-color);
}
</style>
