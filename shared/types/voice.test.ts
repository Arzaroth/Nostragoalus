import { describe, expect, it } from 'vitest'
import { isDmScope, parseVoiceRoomKey, parseVoiceScope, voiceRoomKey, type VoiceScope } from './voice'

describe('voiceRoomKey', () => {
  it('keys a DM by thread', () => {
    expect(voiceRoomKey({ kind: 'dm', threadId: 't1' })).toBe('dm:t1')
  })
  it('keys a league global room and a match room', () => {
    expect(voiceRoomKey({ kind: 'league', leagueId: 'l1', matchId: null })).toBe('league:l1')
    expect(voiceRoomKey({ kind: 'league', leagueId: 'l1', matchId: 'm9' })).toBe('league:l1:match:m9')
  })
})

describe('parseVoiceRoomKey', () => {
  it('round-trips every scope shape', () => {
    const scopes: VoiceScope[] = [
      { kind: 'dm', threadId: 't1' },
      { kind: 'league', leagueId: 'l1', matchId: null },
      { kind: 'league', leagueId: 'l1', matchId: 'm9' },
    ]
    for (const s of scopes) expect(parseVoiceRoomKey(voiceRoomKey(s))).toEqual(s)
  })
  it('returns null for a malformed key', () => {
    expect(parseVoiceRoomKey('nonsense')).toBeNull()
    expect(parseVoiceRoomKey('league:l1:notmatch:m9')).toBeNull()
    expect(parseVoiceRoomKey('dm:a:b')).toBeNull()
  })
})

describe('isDmScope', () => {
  it('narrows a DM scope', () => {
    expect(isDmScope({ kind: 'dm', threadId: 't' })).toBe(true)
    expect(isDmScope({ kind: 'league', leagueId: 'l', matchId: null })).toBe(false)
  })
})

describe('parseVoiceScope', () => {
  it('accepts a valid dm scope', () => {
    expect(parseVoiceScope({ kind: 'dm', threadId: 't1' })).toEqual({ kind: 'dm', threadId: 't1' })
  })
  it('accepts a league scope with and without a match', () => {
    expect(parseVoiceScope({ kind: 'league', leagueId: 'l1', matchId: null })).toEqual({
      kind: 'league',
      leagueId: 'l1',
      matchId: null,
    })
    expect(parseVoiceScope({ kind: 'league', leagueId: 'l1' })).toEqual({ kind: 'league', leagueId: 'l1', matchId: null })
    expect(parseVoiceScope({ kind: 'league', leagueId: 'l1', matchId: 'm9' })).toEqual({
      kind: 'league',
      leagueId: 'l1',
      matchId: 'm9',
    })
  })
  it('rejects junk, wrong types, blank and over-long ids', () => {
    expect(parseVoiceScope(null)).toBeNull()
    expect(parseVoiceScope('nope')).toBeNull()
    expect(parseVoiceScope({ kind: 'other' })).toBeNull()
    expect(parseVoiceScope({ kind: 'dm' })).toBeNull()
    expect(parseVoiceScope({ kind: 'dm', threadId: '' })).toBeNull()
    expect(parseVoiceScope({ kind: 'dm', threadId: 'x'.repeat(65) })).toBeNull()
    expect(parseVoiceScope({ kind: 'league' })).toBeNull()
    expect(parseVoiceScope({ kind: 'league', leagueId: 'l1', matchId: 123 })).toBeNull()
  })
})
