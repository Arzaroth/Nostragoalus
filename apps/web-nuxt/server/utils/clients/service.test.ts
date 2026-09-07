import { describe, expect, it } from 'vitest'
import {
  CLIENT_GATE_EXEMPT,
  MIN_ANDROID_CLIENT,
  clientRefusal,
  isClientTooOld,
  isVersionGatedPath,
  parseClientHeader,
  resolveMinAndroidClient,
} from './service'

describe('parseClientHeader', () => {
  it('reads platform and version', () => {
    expect(parseClientHeader('android/4.9.0')).toEqual({ platform: 'android', version: '4.9.0' })
    expect(parseClientHeader('  ANDROID/4.9.0 ')).toEqual({ platform: 'android', version: '4.9.0' })
    expect(parseClientHeader('ios/1.2')).toEqual({ platform: 'ios', version: '1.2' })
  })

  // The header is advisory. A shape we do not recognise is an unidentified
  // client, never a rejected one - the web app sends no header at all.
  it('treats anything it cannot place as unidentified', () => {
    for (const raw of [
      undefined,
      null,
      42,
      '',
      'android',
      'android/',
      '/4.9.0',
      'android/4.9.0-beta',
      'android/four.nine',
      'android/1.2.3.4.5',
      'a'.repeat(40) + '/1.0.0',
      'android/1234567',
    ]) {
      expect(parseClientHeader(raw)).toBeNull()
    }
  })

  // The literal every non-release build sends. The Dart side asserts it too
  // (`test/update/client_version_test.dart`), so pin both halves: relaxing the
  // version pattern would start refusing every developer and CI build.
  it('does not place a dev build', () => {
    expect(parseClientHeader('android/dev')).toBeNull()
  })

  // Node joins a repeated header with ", ". Fail-open is the design, but it
  // should be a decision on the record rather than an accident of anchoring.
  it('does not place a duplicated header', () => {
    expect(parseClientHeader('android/4.0.0, android/4.9.0')).toBeNull()
  })
})

describe('isClientTooOld', () => {
  it('refuses an android build below the floor', () => {
    expect(isClientTooOld({ platform: 'android', version: '4.8.0' }, '4.9.0')).toBe(true)
    expect(isClientTooOld({ platform: 'android', version: '3.0.0' }, '4.9.0')).toBe(true)
  })

  it('serves the floor itself and anything above it', () => {
    expect(isClientTooOld({ platform: 'android', version: '4.9.0' }, '4.9.0')).toBe(false)
    // Numerically, not as text: "4.10.0" < "4.9.0" as a string would refuse
    // everybody on the newest build.
    expect(isClientTooOld({ platform: 'android', version: '4.10.0' }, '4.9.0')).toBe(false)
    expect(isClientTooOld({ platform: 'android', version: '5.0.0' }, '4.9.0')).toBe(false)
  })

  // A browser, curl, or an APK from before the header existed.
  it('serves an unidentified client', () => {
    expect(isClientTooOld(null, '4.9.0')).toBe(false)
  })

  it('serves a platform it has no floor for', () => {
    expect(isClientTooOld({ platform: 'ios', version: '0.0.1' }, '4.9.0')).toBe(false)
  })

  it('defaults to the shipped floor', () => {
    expect(isClientTooOld({ platform: 'android', version: MIN_ANDROID_CLIENT })).toBe(false)
    expect(isClientTooOld({ platform: 'android', version: '0.0.1' })).toBe(true)
  })
})

describe('isVersionGatedPath', () => {
  it('gates api routes', () => {
    expect(isVersionGatedPath('/api/leaderboard')).toBe(true)
    expect(isVersionGatedPath('/api/auth/get-session')).toBe(true)
    expect(isVersionGatedPath('/api/predictions/crowd?league=l1')).toBe(true)
  })

  // The website is how somebody with a too-old app gets a newer one.
  it('leaves pages and assets alone', () => {
    for (const path of [
      '/',
      '/about',
      '/wc2026/matches',
      '/download/nostragoalus.apk',
      '/_nuxt/x.js',
      '/build-integrity.json',
      '/_ws',
    ]) {
      expect(isVersionGatedPath(path)).toBe(false)
    }
  })

  // The route that says which build to install cannot be behind the check that
  // rejected you - including when something normalized a slash onto the end,
  // which the router resolves to the same handler.
  it('exempts the android release route, however it is spelled', () => {
    expect(isVersionGatedPath(CLIENT_GATE_EXEMPT)).toBe(false)
    expect(isVersionGatedPath('/api/app/android?t=1')).toBe(false)
    expect(isVersionGatedPath('/api/app/android/')).toBe(false)
    expect(isVersionGatedPath('/api/app/android/?t=1')).toBe(false)
  })

  it('does not exempt a route that merely starts the same way', () => {
    expect(isVersionGatedPath('/api/app/android-beta')).toBe(true)
    expect(isVersionGatedPath('/api/app/androids')).toBe(true)
  })
})

// The composition is what can actually turn a user away, so it gets its own
// tests rather than only its three parts.
describe('clientRefusal', () => {
  it('refuses a below-floor client on a gated route', () => {
    expect(clientRefusal('/api/leaderboard', 'android/4.0.0', '4.9.0')).toEqual({
      error: 'client_too_old',
      minimum: '4.9.0',
      current: '4.0.0',
    })
  })

  it('serves everything else', () => {
    // Above the floor.
    expect(clientRefusal('/api/leaderboard', 'android/4.9.0', '4.9.0')).toBeNull()
    // Unidentified.
    expect(clientRefusal('/api/leaderboard', undefined, '4.9.0')).toBeNull()
    expect(clientRefusal('/api/leaderboard', 'android/dev', '4.9.0')).toBeNull()
    // Not a gated path.
    expect(clientRefusal('/about', 'android/4.0.0', '4.9.0')).toBeNull()
    // The escape hatch, even for a client that would be refused elsewhere.
    expect(clientRefusal(CLIENT_GATE_EXEMPT, 'android/4.0.0', '4.9.0')).toBeNull()
    expect(clientRefusal('/api/app/android/', 'android/4.0.0', '4.9.0')).toBeNull()
  })
})

describe('resolveMinAndroidClient', () => {
  it('takes a plain dotted version', () => {
    expect(resolveMinAndroidClient('4.12.0')).toBe('4.12.0')
    expect(resolveMinAndroidClient('  5.0  ')).toBe('5.0')
  })

  // A typo in an env var must not become an outage, so anything unparseable
  // falls back to the shipped constant rather than being obeyed.
  it('ignores anything it cannot parse', () => {
    for (const raw of [undefined, null, 42, '', '  ', 'latest', '4.x', 'v4.9.0', '4.9.0-beta']) {
      expect(resolveMinAndroidClient(raw)).toBe(MIN_ANDROID_CLIENT)
    }
  })
})
