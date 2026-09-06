import { readAndroidBuild, type AndroidBuild } from './service'

// Runtime entrypoint: resolve the configured download directory. Kept in its own
// file (and out of the coverage gate, like storage/index.ts) because it reads
// useRuntimeConfig; the logic lives in service.ts.

function defaultDownloadDir(): string {
  // The deploy bind-mounts the host's APK directory at /data/downloads (see
  // compose.yaml); a bare local run reads the gitignored ./.data/downloads.
  return process.env.NODE_ENV === 'production' ? '/data/downloads' : './.data/downloads'
}

export function androidDownloadDir(): string {
  return useRuntimeConfig().appDownloadDir || defaultDownloadDir()
}

export function currentAndroidBuild(): Promise<AndroidBuild> {
  return readAndroidBuild(androidDownloadDir())
}

export * from './service'
