import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { sha256Hex, bundleDigest, formatDigest } from './digest.mjs'

const hashOf = (s: string) => createHash('sha256').update(s).digest('hex')

describe('sha256Hex', () => {
  it('matches a known vector for the empty input', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('hashes strings and buffers identically for the same bytes', () => {
    expect(sha256Hex('abc')).toBe(sha256Hex(Buffer.from('abc')))
  })
})

describe('bundleDigest', () => {
  const entries = [
    { name: 'a.js', sha256: '11' },
    { name: 'b.js', sha256: '22' },
    { name: 'c.js', sha256: '33' },
  ]

  it('is the SHA-256 of the sorted name/hash manifest', () => {
    expect(bundleDigest(entries)).toBe(hashOf('a.js 11\nb.js 22\nc.js 33'))
  })

  it('is independent of the input order (directory-read order must not matter)', () => {
    const shuffled = [entries[2], entries[0], entries[1]]
    expect(bundleDigest(shuffled)).toBe(bundleDigest(entries))
  })

  it('changes when any chunk content changes', () => {
    const tampered = [{ name: 'a.js', sha256: '11' }, { name: 'b.js', sha256: 'ff' }, { name: 'c.js', sha256: '33' }]
    expect(bundleDigest(tampered)).not.toBe(bundleDigest(entries))
  })

  it('changes when a chunk is added or renamed', () => {
    const renamed = [{ name: 'a.js', sha256: '11' }, { name: 'b-evil.js', sha256: '22' }, { name: 'c.js', sha256: '33' }]
    expect(bundleDigest(renamed)).not.toBe(bundleDigest(entries))
    expect(bundleDigest([...entries, { name: 'd.js', sha256: '44' }])).not.toBe(bundleDigest(entries))
  })
})

describe('formatDigest', () => {
  it('groups a hex digest into space-separated octets', () => {
    expect(formatDigest('0123456789abcdef0123456789abcdef')).toBe('01234567 89abcdef 01234567 89abcdef')
  })

  it('returns an empty string for empty input', () => {
    expect(formatDigest('')).toBe('')
  })
})
