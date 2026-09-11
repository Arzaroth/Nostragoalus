import type { AndroidBuild } from './service'
import {
  ANDROID_DOWNLOAD_PATH,
  APK_FILENAME,
  androidDownloadUrl,
  downloadFilename,
} from './service'

// What a request for the APK should get, decided without touching the
// filesystem or an H3 event so it can be reasoned about and tested directly.
//
// The APK is ~90 MB and was served `no-cache` under one fixed name, so every
// download streamed the whole file out of the Node process and the CDN in front
// absorbed none of it. Caching it needs a URL whose bytes never change, hence the
// versioned name: a new build gets a new URL instead of new bytes behind the old
// one. Once the bytes are in the bucket the origin stops serving them at all and
// only points there.
//
// A cache in front is not by itself a shield, which is why the ONLY request that
// streams anything is one whose raw target is exactly the canonical URL.
// Cloudflare's cache key includes the query string, so `?x=1`, `?x=2`, ... would
// each be a miss dragging the full file off the origin; and the path is
// percent-decoded before routing, so `%6Eostragoalus-...` is another unlimited
// supply of distinct keys for the same bytes. Both are answered with a redirect
// to the canonical URL - a few hundred bytes instead of ~90 MB - rather than
// enumerated. That is a mitigation, not the fix: the fix is a cache rule that
// ignores the query string, and the bucket. See TODO.md.

export type ApkResponse =
  | { kind: 'serve'; filename: string; immutable: boolean }
  | { kind: 'redirect'; to: string }
  | { kind: 'notFound' }

/// [name] is the requested last path segment, as the router resolved it.
/// [rawTarget] is the request target exactly as it arrived, path and query
/// included, so a spelling that is not the canonical one is sent there instead
/// of being served.
export function apkResponse(build: AndroidBuild, name: string, rawTarget = ''): ApkResponse {
  if (!build.available) return { kind: 'notFound' }

  const versioned = downloadFilename(build.version)
  // Only two names exist: this build's versioned name, and the stable alias every
  // install up to 4.9.0 has compiled in. A versioned name from some other build is
  // not this build's bytes, and serving them under it would be a lie an immutable
  // cache then keeps for a year.
  if (name !== versioned && name !== APK_FILENAME) return { kind: 'notFound' }

  // The bytes live in the bucket: every URL for them points there, and nothing is
  // ever streamed from this process.
  if (build.remoteUrl) return { kind: 'redirect', to: build.remoteUrl }

  const canonical = androidDownloadUrl(build.version)
  // The alias when a versioned URL exists, a query string, a percent-encoded
  // spelling, a bare `?` - anything that is not character-for-character the
  // canonical URL gets sent to it.
  if (rawTarget !== canonical) return { kind: 'redirect', to: canonical }

  // An unversioned build (a hand-copied APK with no sidecar) has no versioned
  // URL, so the alias IS canonical and serves - uncached, because a replaced APK
  // must not come back from a cache under the old bytes.
  return { kind: 'serve', filename: versioned, immutable: canonical !== ANDROID_DOWNLOAD_PATH }
}

/// Whether the client already holds exactly these bytes, so the answer can be a
/// 304 instead of the file.
///
/// The stable alias is `no-cache`, which does not mean "do not store" - it means
/// revalidate every time. Without this, every one of those revalidations resent
/// the whole ~90 MB to a client that already had it.
export function etagSatisfied(ifNoneMatch: string | undefined, sha256: string): boolean {
  if (!ifNoneMatch) return false
  const etag = `"${sha256}"`
  return ifNoneMatch
    .split(',')
    .map((t) => t.trim())
    // A cache may weaken the validator on the way back; the digest identifies
    // the bytes either way, so both forms match.
    .some((t) => t === '*' || t === etag || t === `W/${etag}`)
}
