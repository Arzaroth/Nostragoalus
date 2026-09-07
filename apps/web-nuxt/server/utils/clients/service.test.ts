import { describe, expect, it } from 'vitest'
import {
  MIN_ANDROID_CLIENT,
  compareVersions,
  isClientTooOld,
  isVersionGatedPath,
  parseClientHeader,
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
})

describe('compareVersions', () => {
  it('orders numerically, not as strings', () => {
    // The whole reason this is not a string compare: "4.10.0" < "4.9.0" as text
    // would lock out everybody on the newest build.
    expect(compareVersions('4.10.0', '4.9.0')).toBe(1)
    expect(compareVersions('4.9.0', '4.10.0')).toBe(-1)
    expect(compareVersions('4.9.0', '4.9.0')).toBe(0)
  })

  it('treats a missing segment as zero', () => {
    expect(compareVersions('4.9', '4.9.0')).toBe(0)
    expect(compareVersions('4.9.1', '4.9')).toBe(1)
    expect(compareVersions('5', '4.99.99')).toBe(1)
  })

  it('survives junk segments', () => {
    expect(compareVersions('4.x.0', '4.0.0')).toBe(0)
    expect(compareVersions('', '0.0.0')).toBe(0)
  })
})

describe('isClientTooOld', () => {
  it('refuses an android build below the floor', () => {
    expect(isClientTooOld({ platform: 'android', version: '4.8.0' }, '4.9.0')).toBe(true)
    expect(isClientTooOld({ platform: 'android', version: '3.0.0' }, '4.9.0')).toBe(true)
  })

  it('serves the floor itself and anything above it', () => {
    expect(isClientTooOld({ platform: 'android', version: '4.9.0' }, '4.9.0')).toBe(false)
    expect(isClientTooOld({ platform: 'android', version: '4.10.0' }, '4.9.0')).toBe(false)
    expect(isClientTooOld({ platform: 'android', version: '5.0.0' }, '4.9.0')).toBe(false)
  })

  // A browser, curl, or an APK from before the header existed. None of them can
  // be placed, so none of them are turned away.
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
    for (const path of ['/', '/about', '/wc2026/matches', '/download/nostragoalus.apk', '/_nuxt/x.js', '/build-integrity.json']) {
      expect(isVersionGatedPath(path)).toBe(false)
    }
  })

  // The route that says which build to install cannot be behind the check that
  // rejected you, or the app has no way to tell the user what to do.
  it('exempts the android release route, query string and all', () => {
    expect(isVersionGatedPath('/api/app/android')).toBe(false)
    expect(isVersionGatedPath('/api/app/android?t=1')).toBe(false)
  })
})
