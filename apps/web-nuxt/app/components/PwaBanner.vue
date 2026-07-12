<script setup lang="ts">
const { t } = useI18n()
const { $pwa } = useNuxtApp()

// Three PWA states share one banner, surfaced by the priority below:
//   ready       - a new build is waiting; reload to apply it
//   downloading - the new service worker is precaching in the background
//   installable - the browser offered an install prompt and we held it back
// 'ready' wins so a finished update is never buried under an install nag.

// Two staleness signals feed 'ready': the build-manifest poll (plain tabs)
// and the waiting service worker (installed PWA / SW-controlled tabs).
const outdated = useState('outdated-build', () => false)
// Shared so the manifest-poll plugin can clear it on a fresh deploy (re-surface
// after an earlier dismissal). A new waiting SW clears it via the watcher below.
const dismissed = useState('update-dismissed', () => false)
// Set by the pwa-status plugin while a new SW is between 'installing' and
// 'installed'. Read via state so the component stays testable without a worker.
const downloading = useState('sw-downloading', () => false)

const swNeedsRefresh = computed(() => $pwa?.needRefresh === true)
watch(swNeedsRefresh, (now, prev) => {
  if (now && !prev) dismissed.value = false
})

const ready = computed(() => !dismissed.value && (outdated.value || swNeedsRefresh.value))
const installable = computed(() => $pwa?.showInstallPrompt === true && $pwa?.isPWAInstalled !== true)

// One phase at a time, highest priority first.
const phase = computed<'ready' | 'downloading' | 'installable' | null>(() => {
  if (ready.value) return 'ready'
  if (downloading.value) return 'downloading'
  if (installable.value) return 'installable'
  return null
})

const reloading = ref(false)
async function reload() {
  if (reloading.value) return
  reloading.value = true
  if (swNeedsRefresh.value && 'serviceWorker' in navigator) {
    // One deterministic reload: watch for the new SW taking control ourselves
    // (the library's own reload-on-controllerchange skipped the installed PWA
    // window, and a blind timed reload races activation and resurfaces the
    // banner). 3s fallback in case control never flips.
    const controlled = new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })
    })
    await $pwa?.updateServiceWorker(false)
    await Promise.race([controlled, new Promise((resolve) => setTimeout(resolve, 3000))])
  }
  window.location.reload()
}

const installing = ref(false)
async function install() {
  if (installing.value) return
  installing.value = true
  try {
    await $pwa?.install()
  } finally {
    installing.value = false
  }
}
// cancelInstall persists the opt-out, so a declined prompt won't nag every visit.
function dismissInstall() {
  $pwa?.cancelInstall()
}
</script>

<template>
  <Transition name="pwa-banner">
    <div
      v-if="phase"
      class="pwa-banner fixed z-50 flex items-center gap-3 rounded-xl border px-4 py-2.5 shadow-lg text-sm inset-x-3 bottom-3 sm:inset-x-0 sm:bottom-auto sm:top-4 sm:mx-auto sm:w-max sm:max-w-md"
      style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
      role="status"
    >
      <template v-if="phase === 'ready'">
        <i class="pi pi-sparkles shrink-0" style="color: var(--p-primary-color)" />
        <span class="flex-1 min-w-0">{{ t('update.available') }}</span>
        <Button :label="t('update.reload')" size="small" :loading="reloading" @click="reload" />
        <Button
          icon="pi pi-times"
          text
          rounded
          size="small"
          severity="secondary"
          :aria-label="t('update.dismiss')"
          @click="dismissed = true"
        />
      </template>

      <template v-else-if="phase === 'downloading'">
        <i class="pi pi-spin pi-spinner shrink-0" style="color: var(--p-primary-color)" />
        <span class="flex-1 min-w-0">{{ t('update.downloading') }}</span>
      </template>

      <template v-else>
        <i class="pi pi-download shrink-0" style="color: var(--p-primary-color)" />
        <span class="flex-1 min-w-0">{{ t('update.installPrompt') }}</span>
        <Button :label="t('update.install')" size="small" :loading="installing" @click="install" />
        <Button
          icon="pi pi-times"
          text
          rounded
          size="small"
          severity="secondary"
          :aria-label="t('update.dismiss')"
          @click="dismissInstall"
        />
      </template>
    </div>
  </Transition>
</template>

<style scoped>
.pwa-banner-enter-active,
.pwa-banner-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.pwa-banner-enter-from,
.pwa-banner-leave-to {
  opacity: 0;
  transform: translateY(0.5rem);
}
</style>
