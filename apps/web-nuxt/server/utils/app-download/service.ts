import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'

// The Android build the site offers for download. It is NOT part of the web
// image: `mise -C apps/mobile-flutter run apk-publish` builds it from apps/mobile-flutter and drops it
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
  /// Absolute URL when the bytes live off the origin (the R2 bucket), null when
  /// the file itself is on disk here.
  remoteUrl: string | null
}

export const NO_ANDROID_BUILD: AndroidBuild = {
  available: false,
  version: null,
  sizeBytes: null,
  sha256: null,
  builtAt: null,
  remoteUrl: null,
}

export function apkPath(dir: string): string {
  return join(dir, APK_FILENAME)
}

// Hashing a ~60 MB APK on every /about visit would burn a core for nothing: the
// file only changes when a new build is published, so key the digest on the
// identity the filesystem already gives us.
const digests = new Map<string, string>()
// Hashes in flight, by the same key. The endpoint is public and unauthenticated,
// so without this a burst arriving on a cold cache starts one full-file hash per
// request and pins the event loop; sharing the first promise makes the burst cost
// exactly one pass.
const hashing = new Map<string, Promise<string>>()

export function clearAndroidBuildCache(): void {
  digests.clear()
  hashing.clear()
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

interface Sidecar {
  version?: unknown
  builtAt?: unknown
  sizeBytes?: unknown
  sha256?: unknown
  url?: unknown
}

interface SidecarFacts {
  version: string | null
  builtAt: string | null
  sizeBytes: number | null
  sha256: string | null
  url: string | null
}

const NO_SIDECAR: SidecarFacts = {
  version: null,
  builtAt: null,
  sizeBytes: null,
  sha256: null,
  url: null,
}

/// Only an https URL is accepted. The sidecar is operator-written, but it ends
/// up in a redirect the browser follows, so a `javascript:` or `//evil.example`
/// value must not become one.
function readUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  try {
    return new URL(value).protocol === 'https:' ? value : null
  } catch {
    return null
  }
}

// A malformed or unreadable sidecar must not take an on-disk download offline -
// it carries display metadata for that case, so fall back to "unknown version"
// instead of failing. When the bytes are NOT on disk it carries the facts about
// them too, and a sidecar missing any of those simply has no build to describe.
async function readSidecar(dir: string): Promise<SidecarFacts> {
  try {
    const raw = await readFile(join(dir, APK_SIDECAR_FILENAME), 'utf8')
    const parsed = JSON.parse(raw) as Sidecar
    return {
      version: typeof parsed.version === 'string' && parsed.version ? parsed.version : null,
      builtAt: typeof parsed.builtAt === 'string' && parsed.builtAt ? parsed.builtAt : null,
      sizeBytes:
        typeof parsed.sizeBytes === 'number' && Number.isFinite(parsed.sizeBytes) && parsed.sizeBytes > 0
          ? parsed.sizeBytes
          : null,
      sha256: /^[0-9a-f]{64}$/.test(String(parsed.sha256)) ? (parsed.sha256 as string) : null,
      url: readUrl(parsed.url),
    }
  } catch {
    return NO_SIDECAR
  }
}

/// Describe the published APK, or [NO_ANDROID_BUILD] when the directory holds
/// none (the default state: nothing is published until the deploy drops one in).
export async function readAndroidBuild(dir: string): Promise<AndroidBuild> {
  const path = apkPath(dir)
  let info: Awaited<ReturnType<typeof lstat>>
  try {
    info = await lstat(path)
  } catch {
    // No file here. The bytes may still be published, off the origin, with the
    // sidecar describing them - which is the point of putting them in a bucket:
    // the deploy copies a few hundred bytes instead of ~90 MB, and no download
    // ever touches this process.
    const remote = await readSidecar(dir)
    if (!remote.url || remote.sizeBytes === null || remote.sha256 === null) {
      return NO_ANDROID_BUILD
    }
    return {
      available: true,
      version: remote.version,
      sizeBytes: remote.sizeBytes,
      sha256: remote.sha256,
      builtAt: remote.builtAt,
      remoteUrl: remote.url,
    }
  }
  // lstat, not stat: a directory is obviously not a download, and a symlink is
  // refused rather than followed, so whoever can write to the directory cannot
  // turn it into a read of any other file in the container.
  if (!info.isFile() || info.size === 0) return NO_ANDROID_BUILD

  const key = `${path}:${info.mtimeMs}:${info.size}`
  let sha256 = digests.get(key)
  if (!sha256) {
    let inFlight = hashing.get(key)
    if (!inFlight) {
      inFlight = sha256File(path).finally(() => hashing.delete(key))
      hashing.set(key, inFlight)
    }
    sha256 = await inFlight
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
    // The file is right here, so serve it rather than sending anyone elsewhere.
    // This is the dev path, and the fallback if a bucket publish is ever undone.
    remoteUrl: null,
  }
}

/// What the browser saves the file as, and the last segment of the versioned
/// URL. Version-stamped when known, so two downloads of different releases
/// don't collide in the download folder - and so the bytes behind a URL never
/// change, which is what lets the response be cached forever.
export function downloadFilename(version: string | null): string {
  // Defend the header against a sidecar version with quotes or a path separator
  // in it: the file is operator-supplied, but the value lands in a response
  // header AND in a URL.
  const safe = version?.replace(/[^A-Za-z0-9._-]/g, '')
  return safe ? `nostragoalus-${safe}.apk` : APK_FILENAME
}

/// The URL to hand a client for this build.
///
/// Versioned when the build names a version, so the response can be immutable:
/// a cache hit is the whole point, and it is only safe because a new build gets
/// a new URL rather than new bytes behind the old one. An unversioned build (a
/// hand-copied APK with no sidecar) has no such URL and keeps the stable path,
/// which is served uncached.
export function androidDownloadUrl(version: string | null): string {
  const name = downloadFilename(version)
  return name === APK_FILENAME ? ANDROID_DOWNLOAD_PATH : `/download/${name}`
}
