<script setup lang="ts">
const { t } = useI18n()

interface AndroidBuild {
  available: boolean
  version: string | null
  sizeBytes: number | null
  sha256: string | null
  builtAt: string | null
  downloadUrl: string
}

// Whether an APK is published is deploy state, not build state (the file is
// bind-mounted next to the app, not baked into the image), so read it per
// request. A failed read leaves `build` null and renders the "not published"
// branch instead of breaking the page.
const { data: build } = await useAsyncData<AndroidBuild | null>(
  'android-build',
  () => $fetch<AndroidBuild>('/api/app/android'),
  { default: () => null },
)

const available = computed(() => build.value?.available === true)
const megabytes = computed(() => {
  const bytes = build.value?.sizeBytes
  return bytes == null ? null : (bytes / 1024 / 1024).toFixed(1)
})
const groupedDigest = computed(() => groupDigest(build.value?.sha256))
// The ISO day, not a locale-formatted date: this renders on the server and
// again in the browser, and a locale/timezone-dependent string would mismatch.
const publishedOn = computed(() => build.value?.builtAt?.slice(0, 10) ?? null)
</script>

<template>
  <section
    id="android"
    class="ng-card rounded-2xl border p-6"
    style="background: var(--p-content-background); scroll-margin-top: calc(var(--ng-header-h, 4rem) + 1rem)"
  >
    <h2 class="font-semibold text-lg flex items-center gap-2">
      <i class="pi pi-android" style="color: var(--p-primary-color)" /> {{ t('androidApp.title') }}
    </h2>
    <p class="text-sm mt-2" style="color: var(--p-text-muted-color)">{{ t('androidApp.text') }}</p>

    <template v-if="available">
      <a
        :href="build!.downloadUrl"
        download
        class="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-lg font-medium text-sm"
        style="background: var(--p-primary-color); color: var(--p-primary-contrast-color)"
      >
        <i class="pi pi-download" />{{ t('androidApp.download') }}
      </a>
      <dl class="mt-4 flex flex-col gap-2 text-sm">
        <div v-if="build!.version" class="flex items-baseline gap-2">
          <dt class="text-xs uppercase tracking-wider font-semibold shrink-0" style="color: var(--p-text-muted-color)">{{ t('androidApp.versionLabel') }}</dt>
          <dd class="font-mono">{{ build!.version }}</dd>
        </div>
        <div v-if="megabytes" class="flex items-baseline gap-2">
          <dt class="text-xs uppercase tracking-wider font-semibold shrink-0" style="color: var(--p-text-muted-color)">{{ t('androidApp.sizeLabel') }}</dt>
          <dd class="font-mono">{{ t('androidApp.size', { n: megabytes }) }}</dd>
        </div>
        <div v-if="publishedOn" class="flex items-baseline gap-2">
          <dt class="text-xs uppercase tracking-wider font-semibold shrink-0" style="color: var(--p-text-muted-color)">{{ t('androidApp.builtLabel') }}</dt>
          <dd class="font-mono">{{ publishedOn }}</dd>
        </div>
        <div class="flex flex-col gap-1">
          <dt class="text-xs uppercase tracking-wider font-semibold" style="color: var(--p-text-muted-color)">{{ t('androidApp.checksumLabel') }}</dt>
          <dd class="font-mono text-xs break-all select-all p-2 rounded border" style="border-color: var(--p-content-border-color)">{{ groupedDigest }}</dd>
        </div>
      </dl>
      <p class="text-xs mt-3" style="color: var(--p-text-muted-color)">{{ t('androidApp.installNote') }}</p>
    </template>
    <p v-else class="text-sm mt-4 italic" style="color: var(--p-text-muted-color)">{{ t('androidApp.unavailable') }}</p>
  </section>
</template>
