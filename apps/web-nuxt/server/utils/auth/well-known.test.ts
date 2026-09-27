import { describe, it, expect } from 'vitest'
import { ANDROID_PACKAGE, appleAppSiteAssociation, assetLinks, IOS_APP_LINK_PATHS } from './well-known'

const FP = 'AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89'

describe('assetLinks', () => {
  it('serves nothing when no fingerprint is configured', () => {
    expect(assetLinks(undefined)).toBeNull()
    expect(assetLinks('')).toBeNull()
    expect(assetLinks(' , ')).toBeNull()
  })

  it('drops values that are not SHA-256 fingerprints', () => {
    expect(assetLinks('deadbeef')).toBeNull()
    expect(assetLinks(FP.slice(3))).toBeNull()
  })

  it('publishes the configured fingerprints, upper-cased, for our package', () => {
    const body = assetLinks(`${FP.toLowerCase()}, ${FP}`) as { target: Record<string, unknown> }[]
    expect(body).toHaveLength(1)
    expect(body[0]!.target.package_name).toBe(ANDROID_PACKAGE)
    expect(body[0]!.target.sha256_cert_fingerprints).toEqual([FP, FP])
  })
})

describe('appleAppSiteAssociation', () => {
  it('serves nothing without a configured app ID', () => {
    expect(appleAppSiteAssociation(undefined)).toBeNull()
    expect(appleAppSiteAssociation('com.arzaroth.nostragoalus')).toBeNull()
  })

  it('claims only the paths the app routes for the configured app IDs', () => {
    const body = appleAppSiteAssociation('ABCDE12345.com.arzaroth.nostragoalus') as {
      applinks: { details: { appIDs: string[]; components: { '/': string }[] }[] }
    }
    const { appIDs, components } = body.applinks.details[0]!
    expect(appIDs).toEqual(['ABCDE12345.com.arzaroth.nostragoalus'])
    expect(components.map((c) => c['/'])).toEqual(IOS_APP_LINK_PATHS)
    expect(components.map((c) => c['/'])).not.toContain('*')
  })

  it('lists the same app IDs under webcredentials for the SSO https callback', () => {
    const body = appleAppSiteAssociation('ABCDE12345.com.arzaroth.nostragoalus, bad') as {
      webcredentials: { apps: string[] }
    }
    expect(body.webcredentials.apps).toEqual(['ABCDE12345.com.arzaroth.nostragoalus'])
  })
})
