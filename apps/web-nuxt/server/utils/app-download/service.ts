import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

// The Android build the site offers for download. It is NOT part of the web
// image: `mise run apk-publish` builds it from apps/mobile-flutter and drops it
// in the directory the app serves from (bind-mounted in the deploy), so a new
// APK ships without rebuilding or redeploying the site.
export const APK_FILENAME = 'nostragoalus.apk'
// Where the file route lives. The metadata endpoint hands this to the client so
// the page never hardcodes it.
export const ANDROID_DOWNLOAD_PATH = '/download/nostragoalus.apk'
// Written next to the APK by the publish task. Optional: a hand-copied APK with
// no sidecar still downloads, it just has no version to show.
export const APK_SIDECAR_FILENAME = `${APK_FILENAME}.json`

export interface AndroidBuild {
  available: boolean
  /// The app version the APK reports (from the sidecar), null when unknown.
  version: string | null
  sizeBytes: number | null
  sha256: string | null
  /// ISO timestamp: the sidecar's build time, else the file's mtime.
  builtAt: string | null
}

export const NO_ANDROID_BUILD: AndroidBuild = {
  available: false,
  version: null,
  sizeBytes: null,
  sha256: null,
  builtAt: null,
}

export function apkPath(dir: string): string {
  return join(dir, APK_FILENAME)
}

// Hashing a ~60 MB APK on every /about visit would burn a core for nothing: the
// file only changes when a new build is published, so key the digest on the
// identity the filesystem already gives us.
const digests = new Map<string, string>()

export function clearAndroidBuildCache(): void {
  digests.clear()
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

interface Sidecar {
  version?: unknown
  builtAt?: unknown
}

// A malformed or unreadable sidecar must not take the download offline - it only
// carries display metadata, so fall back to "unknown version" instead of failing.
async function readSidecar(dir: string): Promise<{ version: string | null; builtAt: string | null }> {
  try {
    const raw = await readFile(join(dir, APK_SIDECAR_FILENAME), 'utf8')
    const parsed = JSON.parse(raw) as Sidecar
    return {
      version: typeof parsed.version === 'string' && parsed.version ? parsed.version : null,
      builtAt: typeof parsed.builtAt === 'string' && parsed.builtAt ? parsed.builtAt : null,
    }
  } catch {
    return { version: null, builtAt: null }
  }
}

/// Describe the published APK, or [NO_ANDROID_BUILD] when the directory holds
/// none (the default state: nothing is published until the deploy drops one in).
export async function readAndroidBuild(dir: string): Promise<AndroidBuild> {
  const path = apkPath(dir)
  let info: Awaited<ReturnType<typeof stat>>
  try {
    info = await stat(path)
  } catch {
    return NO_ANDROID_BUILD
  }
  // A directory (or anything else) sitting at that name is not a download.
  if (!info.isFile() || info.size === 0) return NO_ANDROID_BUILD

  const key = `${path}:${info.mtimeMs}:${info.size}`
  let sha256 = digests.get(key)
  if (!sha256) {
    sha256 = await sha256File(path)
    // One entry per published build; a replaced APK makes the old key unreachable.
    digests.clear()
    digests.set(key, sha256)
  }

  const sidecar = await readSidecar(dir)
  return {
    available: true,
    version: sidecar.version,
    sizeBytes: info.size,
    sha256,
    builtAt: sidecar.builtAt ?? new Date(info.mtimeMs).toISOString(),
  }
}

/// What the browser saves the file as. Version-stamped when known, so two
/// downloads of different releases don't collide in the download folder.
export function downloadFilename(version: string | null): string {
  // Defend the header against a sidecar version with quotes or a path separator
  // in it: the file is operator-supplied, but the value lands in a response header.
  const safe = version?.replace(/[^A-Za-z0-9._-]/g, '')
  return safe ? `nostragoalus-${safe}.apk` : APK_FILENAME
}
