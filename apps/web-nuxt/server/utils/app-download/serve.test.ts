import { describe, expect, it } from 'vitest'
import { NO_ANDROID_BUILD, androidDownloadUrl, type AndroidBuild } from './service'
import { apkResponse, etagSatisfied } from './serve'

const build = (version: string | null, remoteUrl: string | null = null): AndroidBuild => ({
  available: true,
  version,
  sizeBytes: 94098184,
  sha256: 'deadbeef',
  builtAt: '2026-09-07T23:00:03Z',
  remoteUrl,
})
const REMOTE = 'https://r2.goal.arzaroth.com/apk/nostragoalus-4.9.0.apk'

describe('androidDownloadUrl', () => {
  it('is versioned when the build names a version', () => {
    expect(androidDownloadUrl('4.9.0')).toBe('/download/nostragoalus-4.9.0.apk')
  })

  // A hand-copied APK with no sidecar. There is nothing to version the URL with,
  // so the stable path is the only URL there is.
  it('falls back to the stable path without one', () => {
    expect(androidDownloadUrl(null)).toBe('/download/nostragoalus.apk')
  })

  // The version reaches a URL, so the same scrub the filename does applies.
  it('strips anything that has no business in a path', () => {
    expect(androidDownloadUrl('4.9.0/../../etc')).toBe('/download/nostragoalus-4.9.0....etc.apk')
    expect(androidDownloadUrl('"; rm -rf /')).toBe('/download/nostragoalus-rm-rf.apk')
  })
})

describe('apkResponse', () => {
  const CANON = '/download/nostragoalus-4.9.0.apk'

  it('serves the current versioned name, cacheable forever', () => {
    expect(apkResponse(build('4.9.0'), 'nostragoalus-4.9.0.apk', CANON)).toEqual({
      kind: 'serve',
      filename: 'nostragoalus-4.9.0.apk',
      immutable: true,
    })
  })

  // Every install of 4.9.0 and earlier has this path pinned, so it has to keep
  // answering - but as a redirect, not 94 MB.
  it('redirects the stable alias to the versioned URL', () => {
    expect(apkResponse(build('4.9.0'), 'nostragoalus.apk', '/download/nostragoalus.apk')).toEqual({
      kind: 'redirect',
      to: CANON,
    })
  })

  // Today's bytes under yesterday's version is a lie an immutable cache would
  // then hold for a year.
  it('refuses a versioned name that is not the published build', () => {
    expect(apkResponse(build('4.9.0'), 'nostragoalus-4.8.0.apk', '/x').kind).toBe('notFound')
    expect(apkResponse(build('4.9.0'), 'anything-else.apk', '/x').kind).toBe('notFound')
    expect(apkResponse(build('4.9.0'), '', '/x').kind).toBe('notFound')
  })

  it('has nothing to serve when no build is published', () => {
    expect(apkResponse(NO_ANDROID_BUILD, 'nostragoalus.apk').kind).toBe('notFound')
    expect(apkResponse(NO_ANDROID_BUILD, 'nostragoalus-4.9.0.apk').kind).toBe('notFound')
  })

  describe('an unversioned build', () => {
    // The alias is the only URL, so it must serve rather than redirect - to
    // itself, which would be a loop.
    it('serves the alias directly, uncached', () => {
      expect(apkResponse(build(null), 'nostragoalus.apk', '/download/nostragoalus.apk')).toEqual({
        kind: 'serve',
        filename: 'nostragoalus.apk',
        immutable: false,
      })
    })

    it('still has no versioned URL', () => {
      expect(apkResponse(build(null), 'nostragoalus-4.9.0.apk', '/x').kind).toBe('notFound')
    })
  })

  // A cache in front is not by itself a shield: Cloudflare's cache key includes
  // the query string, and the path is percent-decoded before routing, so both are
  // an unlimited supply of distinct keys for the same ~90 MB. Only the canonical
  // target streams; every other spelling is sent to it.
  describe('a target that is not the canonical one', () => {
    it('redirects a query string rather than serving', () => {
      expect(apkResponse(build('4.9.0'), 'nostragoalus-4.9.0.apk', `${CANON}?x=1`)).toEqual({
        kind: 'redirect',
        to: CANON,
      })
    })

    // h3 percent-decodes the path before routing, so the router hands over the
    // canonical NAME while the request target is something else entirely.
    it('redirects a percent-encoded spelling of the same name', () => {
      expect(
        apkResponse(build('4.9.0'), 'nostragoalus-4.9.0.apk', '/download/%6Eostragoalus-4.9.0.apk'),
      ).toEqual({ kind: 'redirect', to: CANON })
    })

    it('redirects a bare question mark, which normalizes to no query at all', () => {
      expect(apkResponse(build('4.9.0'), 'nostragoalus-4.9.0.apk', `${CANON}?`)).toEqual({
        kind: 'redirect',
        to: CANON,
      })
    })

    it('does not stop the canonical request', () => {
      expect(apkResponse(build('4.9.0'), 'nostragoalus-4.9.0.apk', CANON).kind).toBe('serve')
    })
  })
})

describe('etagSatisfied', () => {
  const sha = 'deadbeef'

  it('matches the exact validator', () => {
    expect(etagSatisfied('"deadbeef"', sha)).toBe(true)
  })

  // A cache may weaken the validator on the way back; the digest identifies the
  // bytes either way.
  it('matches a weakened one, and a list', () => {
    expect(etagSatisfied('W/"deadbeef"', sha)).toBe(true)
    expect(etagSatisfied('"other", W/"deadbeef"', sha)).toBe(true)
    expect(etagSatisfied('*', sha)).toBe(true)
  })

  it('does not match another build, or nothing at all', () => {
    expect(etagSatisfied('"cafebabe"', sha)).toBe(false)
    expect(etagSatisfied(undefined, sha)).toBe(false)
    expect(etagSatisfied('', sha)).toBe(false)
    // Unquoted is not a valid entity-tag and must not match, or a client could
    // be told it holds bytes it does not.
    expect(etagSatisfied('deadbeef', sha)).toBe(false)
  })
})

// Once the bytes are in the bucket, every URL for them points there and the
// ~90 MB never leaves this process.
describe('a build published off the origin', () => {
  it('sends both the versioned URL and the alias to the bucket', () => {
    const canon = '/download/nostragoalus-4.9.0.apk'
    expect(apkResponse(build('4.9.0', REMOTE), 'nostragoalus-4.9.0.apk', canon)).toEqual({
      kind: 'redirect',
      to: REMOTE,
    })
    expect(apkResponse(build('4.9.0', REMOTE), 'nostragoalus.apk', '/download/nostragoalus.apk'))
      .toEqual({ kind: 'redirect', to: REMOTE })
  })

  it('still refuses a name that is not this build', () => {
    expect(apkResponse(build('4.9.0', REMOTE), 'nostragoalus-4.8.0.apk', '/x').kind).toBe('notFound')
  })

  // Nothing is streamed from here at all, so an odd target is the same redirect.
  it('sends an odd target to the bucket too, without touching the origin file', () => {
    expect(
      apkResponse(build('4.9.0', REMOTE), 'nostragoalus-4.9.0.apk', '/download/x.apk?x=1'),
    ).toEqual({ kind: 'redirect', to: REMOTE })
  })
})
