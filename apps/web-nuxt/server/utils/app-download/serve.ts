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
// Two things shape this, and neither is about bandwidth bills.
//
// The APK is ~94 MB and was served `no-cache`, so every download streamed the
// whole file out of the Node process and the CDN in front absorbed none of it.
// Caching it needs a URL whose bytes never change, hence the versioned name: a
// new build gets a new URL instead of new bytes behind the old one.
//
// And a cache in front is not by itself a shield. Cloudflare's cache key
// includes the query string, so `?x=1`, `?x=2`, ... are all misses, and each
// miss drags the full file off the origin - a loop with no rate limit behind it.
// A query string on a download URL has no legitimate use here, so it is answered
// with a redirect to the canonical URL: such a request costs a few hundred bytes
// instead of 94 MB, whether or not anything is cached in front. That is a
// mitigation, not the fix - the fix is a cache rule that ignores the query
// string, or moving the object off the origin. See TODO.md.

export type ApkResponse =
  | { kind: 'serve'; filename: string; immutable: boolean }
  | { kind: 'redirect'; to: string }
  | { kind: 'notFound' }

/// [name] is the requested last path segment; [query] is the raw query string
/// without its `?` (empty when there is none).
export function apkResponse(build: AndroidBuild, name: string, query = ''): ApkResponse {
  const canonical = androidDownloadUrl(build.version)
  // Before anything else: a query string means the canonical URL, cheaply. Ahead
  // of the availability check too, so a flood neither stats nor hashes anything.
  if (query !== '') return { kind: 'redirect', to: canonical }
  if (!build.available) return { kind: 'notFound' }

  const versioned = downloadFilename(build.version)
  // The versioned name of the build actually published: cacheable forever,
  // because these bytes are the only bytes this URL will ever have.
  if (name === versioned && versioned !== APK_FILENAME) {
    return { kind: 'serve', filename: versioned, immutable: true }
  }
  // The stable alias every already-installed app has pinned. It has to keep
  // answering, so it points at the versioned URL rather than serving bytes -
  // unless there is no versioned URL to point at (an unversioned, hand-copied
  // APK), in which case it is the only URL there is and it serves uncached.
  if (name === APK_FILENAME) {
    return canonical === ANDROID_DOWNLOAD_PATH
      ? { kind: 'serve', filename: APK_FILENAME, immutable: false }
      : { kind: 'redirect', to: canonical }
  }
  // A versioned name from some other build. Serving today's bytes under
  // yesterday's version would be a lie that a cache then keeps for a year.
  return { kind: 'notFound' }
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
