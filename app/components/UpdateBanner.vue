<script setup lang="ts">
const { t } = useI18n()
const { $pwa } = useNuxtApp()

// Two staleness signals, one banner: the build-manifest poll (plain tabs)
// and the waiting service worker (installed PWA / SW-controlled tabs).
const outdated = useState('outdated-build', () => false)
const dismissed = ref(false)
const swNeedsRefresh = computed(() => $pwa?.needRefresh === true)
const show = computed(() => !dismissed.value && (outdated.value || swNeedsRefresh.value))

const reloading = ref(false)
async function reload() {
  reloading.value = true
  if (swNeedsRefresh.value) {
    // updateServiceWorker(true) reloads via a controllerchange round-trip
    // that can leave this window behind (observed stuck in the installed
    // PWA while a sibling tab reloaded). Activate the waiting SW, but only
    // give it a beat - then force the reload ourselves either way.
    await Promise.race([
      $pwa?.updateServiceWorker(true),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ])
  }
  window.location.reload()
}
</script>

<template>
  <Transition name="update-banner">
    <div
      v-if="show"
      class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border px-4 py-2 shadow-lg text-sm"
      style="background: var(--p-content-background); border-color: var(--p-content-border-color)"
      role="status"
    >
      <i class="pi pi-sparkles" style="color: var(--p-primary-color)" />
      <span>{{ t('update.available') }}</span>
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
    </div>
  </Transition>
</template>

<style scoped>
.update-banner-enter-active,
.update-banner-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.update-banner-enter-from,
.update-banner-leave-to {
  opacity: 0;
  transform: translate(-50%, 0.5rem);
}
</style>
