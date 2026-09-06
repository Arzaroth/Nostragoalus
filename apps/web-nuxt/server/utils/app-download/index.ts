import { readAndroidBuild, type AndroidBuild } from './service'

// Runtime entrypoint: resolve the configured download directory. Kept in its own
// file (and out of the coverage gate, like storage/index.ts) because it reads
// useRuntimeConfig; the logic lives in service.ts.

function defaultDownloadDir(): string {
  // The deploy bind-mounts the host's APK directory at /data/downloads (see
  // compose.yaml). Everywhere else, read ./downloads - the same directory the
  // publish task writes to - so an APK published locally shows up in dev. The
  // e2e stack points NUXT_APP_DOWNLOAD_DIR elsewhere so its fixture cannot
  // delete a developer's published build.
  return process.env.NODE_ENV === 'production' ? '/data/downloads' : './downloads'
}

export function androidDownloadDir(): string {
  return useRuntimeConfig().appDownloadDir || defaultDownloadDir()
}

export function currentAndroidBuild(): Promise<AndroidBuild> {
  return readAndroidBuild(androidDownloadDir())
}

export * from './service'
