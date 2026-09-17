/**
 * The canary itself, without the network.
 *
 * scripts/canary talks to the real feeds; these tests talk to nobody. They hand
 * it payloads built by hand: a complete one (it must say yes), the same ones
 * missing a key or carrying a value of the wrong type (it must say no, and name
 * the key), and an empty one (it must not cry wolf).
 */
import { describe, expect, it } from 'vitest'
import { CHECKS, dig, isObject, Ledger, nullable, oneOf, RARE, REQUIRED, SAMPLED } from '../../scripts/canary/ledger'

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

describe('numeric checks', () => {
  it('accepts a number written either way', () => {
    for (const value of [5, '5', ' 5 ']) expect(CHECKS.integer.test(value)).toBe(true)
    expect(CHECKS.number.test('55.1')).toBe(true)
  })

  it('refuses a scalar wrapped in a list, which is how a feed adds multi-value', () => {
    // `digits([5])` is '5', so stringifying first let this through and the
    // app's Number() broke while the canary stayed green.
    expect(CHECKS.integer.test([5])).toBe(false)
    expect(CHECKS.number.test([5])).toBe(false)
  })

  it('refuses a boolean, an object and an empty string', () => {
    for (const value of [true, {}, '', null, undefined]) {
      expect(CHECKS.integer.test(value)).toBe(false)
      expect(CHECKS.number.test(value)).toBe(false)
    }
  })

  it('refuses a number that is not one', () => {
    expect(CHECKS.integer.test('three')).toBe(false)
    expect(CHECKS.integer.test('5.5')).toBe(false)
    expect(CHECKS.number.test('5.5')).toBe(true)
  })

  it('wants epoch millis to be an actual number, not a numeric string', () => {
    expect(CHECKS.epochMillis.test(1770000000000)).toBe(true)
    expect(CHECKS.epochMillis.test('1770000000000')).toBe(false)
    expect(CHECKS.epochMillis.test(0)).toBe(false)
  })

  it('wants an http url, not any text', () => {
    expect(CHECKS.url.test('https://example.test/a.png')).toBe(true)
    expect(CHECKS.url.test('example.test/a.png')).toBe(false)
  })

  it('separates a list from a non-empty one, and an object from a list', () => {
    expect(CHECKS.list.test([])).toBe(true)
    expect(CHECKS.filledList.test([])).toBe(false)
    expect(CHECKS.object.test([])).toBe(false)
    expect(CHECKS.object.test(null)).toBe(false)
    expect(CHECKS.object.test({})).toBe(true)
  })
})

describe('isObject', () => {
  it('is the one definition the sources share', () => {
    expect(isObject({})).toBe(true)
    expect(isObject([])).toBe(false)
    expect(isObject(null)).toBe(false)
    expect(isObject('text')).toBe(false)
  })
})

describe('an empty string on a contextual key', () => {
  const sampled = [['name', SAMPLED, CHECKS.filledText] as const]

  it('reads as absence, the way an omitted key does', () => {
    // ESPN serializes an undrawn side with empty strings and the adapters read
    // that as absence; reporting TYPE for it says "the feed changed shape"
    // about a value the app handles by design.
    const ledger = new Ledger([['row', sampled]])
    ledger.check('row', { name: '' }, sampled)
    expect(ledger.verdict('row.name')).toBe('MISSING')
    ledger.check('row', { name: 'Alpha' }, sampled)
    expect(ledger.verdict('row.name')).toBe('ok')
  })

  it('is still held against a required key', () => {
    const strict = [['name', REQUIRED, CHECKS.filledText] as const]
    const ledger = new Ledger([['row', strict]])
    ledger.check('row', { name: '' }, strict)
    expect(ledger.verdict('row.name')).toBe('TYPE')
  })
})

describe('checkEach', () => {
  const table = [['id', REQUIRED, CHECKS.identifier] as const]

  it('inspects every object and counts them', () => {
    const ledger = new Ledger([['row', table]])
    expect(ledger.checkEach('row', [{ id: '1' }, { id: '2' }], table)).toBe(2)
    expect(ledger.verdict('row.id')).toBe('ok')
  })

  it('records an anomaly for an entry that is not an object', () => {
    // Half the hand-written copies of this loop used to `continue` silently, so
    // a list of strings was reported in some scopes and swallowed in others.
    const ledger = new Ledger([['row', table]])
    expect(ledger.checkEach('row', [{ id: '1' }, 'nope'], table, 'the rows')).toBe(1)
    expect(ledger.anomalies).toEqual(['an entry of the rows is not an object'])
    expect(ledger.failures()).toContain('an entry of the rows is not an object')
  })

  it('treats a missing list as nothing to look at, and a non-list as an anomaly', () => {
    const ledger = new Ledger([['row', table]])
    expect(ledger.checkEach('row', null, table, 'the rows')).toBe(0)
    expect(ledger.anomalies).toEqual([])
    ledger.checkEach('row', { id: '1' }, table, 'the rows')
    expect(ledger.anomalies).toEqual(['the rows is not a list'])
  })
})
