<script setup lang="ts">
const { t, locale, locales, setLocale } = useI18n()
const config = useRuntimeConfig()
const nuxtApp = useNuxtApp()
const router = useRouter()

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
    <div class="mx-auto max-w-7xl px-4 sm:px-6 py-1.5 flex items-center justify-between gap-x-4 gap-y-1 flex-wrap">
      <div class="flex items-center gap-1">
        <span>{{ t('footer.version') }}:</span>
        <NuxtLink to="/about" class="hover:underline font-medium" style="color: var(--p-primary-color)">{{ config.public.version }}</NuxtLink>
        <span v-if="pageMs != null" class="ml-2">{{ t('footer.page') }}: <b style="color: var(--p-text-color)">{{ pageMs }}ms</b></span>
      </div>
      <div class="flex items-center gap-3">
        <label class="inline-flex items-center gap-1 cursor-pointer">
          <i class="pi pi-globe" style="font-size: 0.8rem" />
          <select
            v-model="lang"
            class="bg-transparent border-0 cursor-pointer text-xs"
            style="color: var(--p-text-muted-color)"
            :aria-label="t('prefs.language')"
          >
            <option v-for="l in locales" :key="l.code" :value="l.code">{{ l.name }}</option>
          </select>
        </label>
        <a href="/docs/api" target="_blank" rel="noopener" class="hover:underline">API</a>
      </div>
    </div>
  </footer>
</template>
