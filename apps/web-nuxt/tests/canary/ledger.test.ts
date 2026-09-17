/**
 * The canary itself, without the network.
 *
 * scripts/canary talks to the real feeds; these tests talk to nobody. They hand
 * it payloads built by hand: a complete one (it must say yes), the same ones
 * missing a key or carrying a value of the wrong type (it must say no, and name
 * the key), and an empty one (it must not cry wolf).
 */
import { describe, expect, it } from 'vitest'
import { CHECKS, dig, Ledger, nullable, oneOf, RARE, REQUIRED, SAMPLED } from '../../scripts/canary/ledger'

describe('dig', () => {
  it('walks a dotted path through objects and arrays', () => {
    const doc = { a: { b: [{ c: 1 }, { c: 2 }] } }
    expect(dig(doc, 'a.b.1.c')).toEqual({ found: true, value: 2 })
  })

  it('reports a key that is present and null as found, so the check decides', () => {
    expect(dig({ a: null }, 'a')).toEqual({ found: true, value: null })
  })

  it('reports a key that is absent as not found', () => {
    expect(dig({ a: 1 }, 'b')).toEqual({ found: false, value: null })
    expect(dig({ a: { b: 1 } }, 'a.c')).toEqual({ found: false, value: null })
  })

  it('does not walk past a scalar or off the end of a list', () => {
    expect(dig({ a: 3 }, 'a.b').found).toBe(false)
    expect(dig({ a: [1] }, 'a.4').found).toBe(false)
    expect(dig({ a: [1] }, 'a.x').found).toBe(false)
  })
})

describe('checks', () => {
  it('accepts a number where an identifier is expected, because providers stringify ids', () => {
    expect(CHECKS.identifier.test(42)).toBe(true)
    expect(CHECKS.identifier.test('42')).toBe(true)
    expect(CHECKS.identifier.test('  ')).toBe(false)
    expect(CHECKS.identifier.test(null)).toBe(false)
  })

  it('reads a date the way the normalizers do', () => {
    expect(CHECKS.date.test('2026-06-11T19:00:00Z')).toBe(true)
    expect(CHECKS.date.test('soon')).toBe(false)
  })

  it('separates an empty string from a filled one', () => {
    expect(CHECKS.text.test('')).toBe(true)
    expect(CHECKS.filledText.test('')).toBe(false)
  })

  it('lets nullable() admit null without admitting the wrong type', () => {
    const spec = nullable(CHECKS.integer)
    expect(spec.test(null)).toBe(true)
    expect(spec.test(3)).toBe(true)
    expect(spec.test('three')).toBe(false)
    expect(spec.label).toBe('integer or null')
  })

  it('holds oneOf to its vocabulary', () => {
    const state = oneOf('pre/in/post', ['pre', 'in', 'post'])
    expect(state.test('post')).toBe(true)
    expect(state.test('finished')).toBe(false)
  })
})

describe('Ledger verdicts', () => {
  const table = [['id', REQUIRED, CHECKS.identifier] as const]

  it('says ok when a required key is on every object', () => {
    const ledger = new Ledger([['row', table]])
    ledger.check('row', { id: '1' }, table)
    ledger.check('row', { id: '2' }, table)
    expect(ledger.verdict('row.id')).toBe('ok')
    expect(ledger.failures()).toEqual([])
  })

  it('names the key when a required one goes missing on any object', () => {
    const ledger = new Ledger([['row', table]])
    ledger.check('row', { id: '1' }, table)
    ledger.check('row', {}, table)
    expect(ledger.verdict('row.id')).toBe('MISSING')
    expect(ledger.failures()).toEqual(['row.id'])
  })

  it('reports TYPE, not MISSING, when the key is there with the wrong value', () => {
    const ledger = new Ledger([['row', table]])
    ledger.check('row', { id: '  ' }, table)
    expect(ledger.verdict('row.id')).toBe('TYPE')
    expect(ledger.failures()).toEqual(['row.id'])
  })

  it('prints the offending value so the report names what changed', () => {
    const ledger = new Ledger([['row', table]])
    ledger.check('row', { id: { nested: true } }, table)
    expect(ledger.lines().join('\n')).toContain('of the wrong type, e.g. {"nested":true}')
  })

  it('declares every planned key up front, so one never silently drops out', () => {
    const ledger = new Ledger([['row', table]])
    expect(ledger.order).toEqual(['row.id'])
    expect(ledger.verdict('row.id')).toBe('unchecked')
  })

  it('does not cry wolf when no object of that kind turned up at all', () => {
    const ledger = new Ledger([['row', table]])
    expect(ledger.unchecked()).toEqual(['row.id'])
    expect(ledger.failures()).toEqual([])
  })

  describe('sampled keys', () => {
    const sampled = [['card', SAMPLED, CHECKS.filledText] as const]

    it('passes on one sighting across many objects', () => {
      const ledger = new Ledger([['row', sampled]])
      ledger.check('row', {}, sampled)
      ledger.check('row', {}, sampled)
      ledger.check('row', { card: 'red' }, sampled)
      expect(ledger.verdict('row.card')).toBe('ok')
    })

    it('fails when objects were inspected and it never appeared', () => {
      const ledger = new Ledger([['row', sampled]])
      ledger.check('row', {}, sampled)
      expect(ledger.verdict('row.card')).toBe('MISSING')
    })

    it('treats an explicit null as absence, the way an omitted key reads', () => {
      const ledger = new Ledger([['row', sampled]])
      ledger.check('row', { card: null }, sampled)
      expect(ledger.verdict('row.card')).toBe('MISSING')
      expect(ledger.verdict('row.card')).not.toBe('TYPE')
    })
  })

  describe('rare keys', () => {
    const rare = [['ownGoal', RARE, CHECKS.boolean] as const]

    it('is absent, not failing, when its context did not occur', () => {
      const ledger = new Ledger([['row', rare]])
      ledger.check('row', {}, rare)
      expect(ledger.verdict('row.ownGoal')).toBe('absent')
      expect(ledger.failures()).toEqual([])
      expect(ledger.absent()).toEqual(['row.ownGoal'])
    })

    it('still fails on a wrong type when it does appear', () => {
      const ledger = new Ledger([['row', rare]])
      ledger.check('row', { ownGoal: 'yes' }, rare)
      expect(ledger.verdict('row.ownGoal')).toBe('TYPE')
      expect(ledger.failures()).toEqual(['row.ownGoal'])
    })

    it('holds a required key to null even though a rare one is excused', () => {
      const strict = [['score', REQUIRED, CHECKS.integer] as const]
      const ledger = new Ledger([['row', strict]])
      ledger.check('row', { score: null }, strict)
      expect(ledger.verdict('row.score')).toBe('TYPE')
    })
  })

  it('records an anomaly once, however many times it is seen', () => {
    const ledger = new Ledger()
    ledger.anomaly('an entry is not an object')
    ledger.anomaly('an entry is not an object')
    expect(ledger.anomalies).toHaveLength(1)
    expect(ledger.failures()).toEqual(['an entry is not an object'])
  })

  it('counts sightings against the objects looked at', () => {
    const ledger = new Ledger([['row', table]])
    ledger.check('row', { id: '1' }, table)
    ledger.check('row', {}, table)
    expect(ledger.lines()[0]).toContain('1/2')
  })
})
