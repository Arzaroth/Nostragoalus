import { describe, it, expect, beforeAll } from 'vitest'
import { createTestDb, type TestDb } from '../../../tests/db'
import { ssoProvider } from '../../../db/schema'
import {
  domainMatchesList,
  domainOfEmail,
  findDomainConflicts,
  normalizeDomain,
  parseDomainList,
  resolveSsoProviderId,
} from './sso-domains'

describe('normalizeDomain', () => {
  it('lowercases, trims and strips a leading @', () => {
    expect(normalizeDomain('  @Corp.Test ')).toBe('corp.test')
  })

  it.each(['', 'no-dot', 'sp ace.com', 'bad_char.com', '@'])('rejects %j', (raw) => {
    expect(normalizeDomain(raw)).toBeNull()
  })
})

describe('parseDomainList', () => {
  it('parses a comma/space separated string with dedup', () => {
    expect(parseDomainList('corp.test, corp.fr corp.test')).toEqual(['corp.test', 'corp.fr'])
  })

  it('parses an array form', () => {
    expect(parseDomainList(['@corp.test', 'B.example.org'])).toEqual(['corp.test', 'b.example.org'])
  })

  it('rejects the whole list when one entry is invalid', () => {
    expect(parseDomainList('corp.test, nope')).toBeNull()
  })

  it('rejects empty input', () => {
    expect(parseDomainList('')).toBeNull()
    expect(parseDomainList(undefined)).toBeNull()
  })
})

describe('domainOfEmail', () => {
  it('extracts the domain after the last @', () => {
    expect(domainOfEmail('Alice@Corp.Test')).toBe('corp.test')
  })

  it.each(['nodomain', '@corp.test', 'x@'])('returns null for %j', (email) => {
    expect(domainOfEmail(email)).toBeNull()
  })
})

describe('domainMatchesList', () => {
  it('matches exact entries in a CSV list', () => {
    expect(domainMatchesList('corp.fr', 'corp.test, corp.fr')).toBe(true)
  })

  it('matches subdomains like the plugin does', () => {
    expect(domainMatchesList('mail.corp.test', 'corp.test')).toBe(true)
  })

  it('does not match unrelated or partial domains', () => {
    expect(domainMatchesList('notcorp.test', 'corp.test')).toBe(false)
    expect(domainMatchesList('corp.example', 'corp.test,corp.fr')).toBe(false)
  })

  it('handles null/empty CSV', () => {
    expect(domainMatchesList('corp.test', null)).toBe(false)
    expect(domainMatchesList('corp.test', '')).toBe(false)
  })
})

describe('db-backed resolution', () => {
  let db: TestDb

  beforeAll(async () => {
    db = (await createTestDb()).db
    await db.insert(ssoProvider).values([
      { id: 'p1', issuer: 'https://idp-a.test', providerId: 'acme', domain: 'corp.test,corp.fr' },
      { id: 'p2', issuer: 'https://idp-b.test', providerId: 'globex', domain: 'globex.test' },
    ])
  })

  it('resolves any domain of a CSV list', async () => {
    expect(await resolveSsoProviderId(db, 'corp.test')).toBe('acme')
    expect(await resolveSsoProviderId(db, 'corp.fr')).toBe('acme')
    expect(await resolveSsoProviderId(db, 'globex.test')).toBe('globex')
  })

  it('returns null for an unknown domain', async () => {
    expect(await resolveSsoProviderId(db, 'nowhere.test')).toBeNull()
  })

  it('hides draft, disabled and unverified providers from the login resolver', async () => {
    const fresh = (await createTestDb()).db
    await fresh.insert(ssoProvider).values([
      { id: 'd1', issuer: 'https://i.test', providerId: 'live', domain: 'live.test', status: 'enabled', domainVerified: true },
      { id: 'd2', issuer: 'https://i.test', providerId: 'draft', domain: 'draft.test', status: 'draft', domainVerified: true },
      { id: 'd3', issuer: 'https://i.test', providerId: 'paused', domain: 'paused.test', status: 'disabled', domainVerified: true },
      { id: 'd4', issuer: 'https://i.test', providerId: 'unverified', domain: 'unverified.test', status: 'enabled', domainVerified: false },
    ])
    expect(await resolveSsoProviderId(fresh, 'live.test')).toBe('live')
    expect(await resolveSsoProviderId(fresh, 'draft.test')).toBeNull()
    expect(await resolveSsoProviderId(fresh, 'paused.test')).toBeNull()
    expect(await resolveSsoProviderId(fresh, 'unverified.test')).toBeNull()
  })

  it('flags domains captured by another provider', async () => {
    expect(await findDomainConflicts(db, 'globex', ['corp.fr', 'globex.test'])).toEqual(['corp.fr'])
  })

  it('flags subdomain overlap in both directions', async () => {
    // mail.corp.test falls under acme's corp.test
    expect(await findDomainConflicts(db, 'globex', ['mail.corp.test'])).toEqual(['mail.corp.test'])
    // test (parent of globex.test) would swallow globex's domain
    expect(await findDomainConflicts(db, 'acme', ['globex.test', 'sub.globex.test'])).toEqual(['globex.test', 'sub.globex.test'])
  })

  it('does not flag a provider against itself', async () => {
    expect(await findDomainConflicts(db, 'acme', ['corp.test', 'corp.fr', 'corp.de'])).toEqual([])
  })
})
