import { describe, it, expect } from 'vitest'
import { pruneLeagueSelection, selectedLeagueFor, withLeagueSelection } from './league-cookie'

describe('selectedLeagueFor', () => {
  it('reads the slug entry and tolerates garbage', () => {
    expect(selectedLeagueFor({ wc: 'l1' }, 'wc')).toBe('l1')
    expect(selectedLeagueFor({ wc: 'l1' }, 'euro')).toBeNull()
    expect(selectedLeagueFor(null, 'wc')).toBeNull()
    expect(selectedLeagueFor('junk', 'wc')).toBeNull()
    expect(selectedLeagueFor(['l1'], 'wc')).toBeNull()
    expect(selectedLeagueFor({ wc: 42 }, 'wc')).toBeNull()
    expect(selectedLeagueFor({ wc: '' }, 'wc')).toBeNull()
  })
})

describe('withLeagueSelection', () => {
  it('sets and clears without mutating the input', () => {
    const map = { wc: 'l1' }
    const set = withLeagueSelection(map, 'euro', 'l2')
    expect(set).toEqual({ wc: 'l1', euro: 'l2' })
    expect(map).toEqual({ wc: 'l1' })
    expect(withLeagueSelection(set, 'wc', null)).toEqual({ euro: 'l2' })
    expect(withLeagueSelection(undefined, 'wc', 'l3')).toEqual({ wc: 'l3' })
    expect(withLeagueSelection('junk', 'wc', null)).toEqual({})
  })
})

describe('pruneLeagueSelection', () => {
  it('keeps valid selections and drops stale ones', () => {
    expect(pruneLeagueSelection({ wc: 'l1' }, 'wc', ['l1', 'l2'])).toEqual({ wc: 'l1' })
    expect(pruneLeagueSelection({ wc: 'l1', euro: 'l9' }, 'wc', ['l2'])).toEqual({ euro: 'l9' })
    expect(pruneLeagueSelection({ euro: 'l9' }, 'wc', [])).toEqual({ euro: 'l9' })
    expect(pruneLeagueSelection(null, 'wc', ['l1'])).toEqual({})
  })
})
