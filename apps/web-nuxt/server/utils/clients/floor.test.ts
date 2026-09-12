import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compareVersions } from '#shared/version'
import { MIN_ANDROID_CLIENT } from './service'

// The floor is checked against the version an APK stamps itself with, which
// since the version split is the MOBILE app's own (apps/mobile-flutter/app/
// pubspec.yaml), not this package.json. A floor above it refuses every client
// the moment it deploys - including the build cut from that very release, which
// would brick the app on the first request and could only be undone by another
// deploy.
//
// It is a one-character mistake (bumping the floor while writing the feature,
// then releasing something else), so it is a test rather than a comment.
describe('MIN_ANDROID_CLIENT', () => {
  const pubspec = readFileSync(
    new URL('../../../../mobile-flutter/app/pubspec.yaml', import.meta.url),
    'utf8',
  )
  const version = /^version: *([0-9.]+)\+/m.exec(pubspec)?.[1] ?? ''
  const code = Number(/^version: *[0-9.]+\+(\d+)/m.exec(pubspec)?.[1] ?? '0')

  it('reads the mobile app version', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  // The version NAME restarted at 1.0.0 when the two lines split; the build code
  // could not, because Android orders upgrades by the code alone and refuses a
  // lower one. 4.10.0 was the last build published on the site-numbered line and
  // the old scheme (major*10000 + minor*100 + patch) stamped it 41000, so a code
  // at or below that cannot be installed over what people are already holding -
  // their only way forward would be an uninstall, which destroys the E2EE chat
  // identity in the keystore. Caught here because nothing else would: the APK
  // builds fine and fails on the phone.
  it('has a build code above every build ever published', () => {
    expect(code, `pubspec build number ${code} is not above the published 41000`)
      .toBeGreaterThan(41000)
  })

  it('is never ahead of the app version being released', () => {
    expect(
      compareVersions(MIN_ANDROID_CLIENT, version),
      `the floor (${MIN_ANDROID_CLIENT}) is newer than the app version (${version}), which would refuse every client including the APK built from it`,
    ).toBeLessThanOrEqual(0)
  })
})
