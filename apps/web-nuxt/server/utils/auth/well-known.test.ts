import { describe, it, expect } from 'vitest'
import { ANDROID_PACKAGE, appleAppSiteAssociation, assetLinks } from './well-known'

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

  it('claims every path for the configured app IDs', () => {
    const body = appleAppSiteAssociation('ABCDE12345.com.arzaroth.nostragoalus') as {
      applinks: { details: { appIDs: string[]; components: unknown[] }[] }
    }
    expect(body.applinks.details[0]!.appIDs).toEqual(['ABCDE12345.com.arzaroth.nostragoalus'])
    expect(body.applinks.details[0]!.components).toEqual([{ '/': '*' }])
  })
})
