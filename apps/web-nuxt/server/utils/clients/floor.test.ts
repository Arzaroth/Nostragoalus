import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MIN_ANDROID_CLIENT, compareVersions } from './service'

// The floor is checked against the version an APK stamps itself with, and
// `apk-publish` stamps it from this same package.json. So a floor ABOVE the
// version being released refuses every client the moment it deploys - including
// the build cut from that very release, which would brick the app on the first
// request and could only be undone by another deploy.
//
// It is a one-character mistake (bumping the floor while writing the feature,
// then releasing a patch instead of a minor), so it is a test rather than a
// comment.
describe('MIN_ANDROID_CLIENT', () => {
  const version = JSON.parse(
    readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
  ).version as string

  it('is never ahead of the version being released', () => {
    expect(
      compareVersions(MIN_ANDROID_CLIENT, version),
      `the floor (${MIN_ANDROID_CLIENT}) is newer than this release (${version}), which would refuse every client including the APK built from it`,
    ).toBeLessThanOrEqual(0)
  })
})
