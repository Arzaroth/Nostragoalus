import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { createSignedTokenCodec } from './codec'

interface P {
  x: string
  v: 1
}
const isValid = (value: unknown): value is P => {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Record<string, unknown>
  return p.v === 1 && typeof p.x === 'string' && p.x.length > 0
}

const SECRET = 'test-secret'
const codec = createSignedTokenCodec<P>('nostragoalus/test/v1', isValid)

describe('createSignedTokenCodec', () => {
  it('round-trips a valid payload', () => {
    const token = codec.sign(SECRET, { x: 'hello', v: 1 })
    expect(codec.verify(SECRET, token)).toEqual({ x: 'hello', v: 1 })
  })

  it('rejects a token signed with another secret', () => {
    const token = codec.sign(SECRET, { x: 'hello', v: 1 })
    expect(codec.verify('other', token)).toBeNull()
  })

  it('rejects a tampered body', () => {
    const token = codec.sign(SECRET, { x: 'hello', v: 1 })
    const forged = `${Buffer.from(JSON.stringify({ x: 'evil', v: 1 })).toString('base64url')}.${token.split('.')[1]}`
    expect(codec.verify(SECRET, forged)).toBeNull()
  })

  it('rejects missing, oversized, dotless and short-MAC tokens', () => {
    expect(codec.verify(SECRET, undefined)).toBeNull()
    expect(codec.verify(SECRET, 'x'.repeat(513))).toBeNull()
    expect(codec.verify(SECRET, 'nodothere')).toBeNull()
    expect(codec.verify(SECRET, '.leadingdot')).toBeNull()
    const body = Buffer.from(JSON.stringify({ x: 'hi', v: 1 })).toString('base64url')
    expect(codec.verify(SECRET, `${body}.short`)).toBeNull()
  })

  it('rejects an authentically-signed but shape-invalid body', () => {
    for (const bad of [{ x: '', v: 1 }, { x: 'hi', v: 2 }, { v: 1 }, [], 'nope']) {
      const body = Buffer.from(JSON.stringify(bad)).toString('base64url')
      expect(codec.verify(SECRET, `${body}.${codec.signBody(SECRET, body)}`)).toBeNull()
    }
  })

  it('domain-separates: two tags never validate each other', () => {
    const other = createSignedTokenCodec<P>('nostragoalus/other/v1', isValid)
    const token = codec.sign(SECRET, { x: 'hello', v: 1 })
    expect(other.verify(SECRET, token)).toBeNull()
  })

  it('rejects non-JSON body', () => {
    const body = Buffer.from('not json{').toString('base64url')
    expect(codec.verify(SECRET, `${body}.${codec.signBody(SECRET, body)}`)).toBeNull()
  })

  it('refuses to sign with an empty secret', () => {
    expect(() => codec.sign('', { x: 'hello', v: 1 })).toThrow()
    expect(() => codec.signBody('', 'body')).toThrow()
  })

  it('never validates a token under an empty secret', () => {
    // A token minted with a real secret must not verify when the secret is empty,
    // and a token an attacker forges against HMAC('') must be rejected too.
    const real = codec.sign(SECRET, { x: 'hello', v: 1 })
    expect(codec.verify('', real)).toBeNull()
    const body = Buffer.from(JSON.stringify({ x: 'hello', v: 1 })).toString('base64url')
    const forgedMac = createHmac('sha256', createHmac('sha256', '').update('nostragoalus/test/v1').digest())
      .update(body)
      .digest('base64url')
    expect(codec.verify('', `${body}.${forgedMac}`)).toBeNull()
  })
})
