import { describe, expect, it } from 'vitest'
import {
  MUTED_TALKING_SUSTAIN_MS,
  MUTED_TALKING_THROTTLE_MS,
  VOICE_SPEAKING_THRESHOLD,
  createMutedTalkingTracker,
  isCallEstablished,
  levelFromSamples,
  rosterDelta,
  shouldOffer,
} from './voice'

describe('shouldOffer', () => {
  it('the smaller id offers, the larger waits', () => {
    expect(shouldOffer('a', 'b')).toBe(true)
    expect(shouldOffer('b', 'a')).toBe(false)
  })
  it('exactly one side of a pair offers', () => {
    expect(shouldOffer('a', 'b')).not.toBe(shouldOffer('b', 'a'))
  })
})

describe('isCallEstablished', () => {
  it('a DM is established only once both parties are present', () => {
    expect(isCallEstablished('dm', 1)).toBe(false)
    expect(isCallEstablished('dm', 2)).toBe(true)
  })
  it('a league room is established the moment the local member joins', () => {
    expect(isCallEstablished('league', 0)).toBe(false)
    expect(isCallEstablished('league', 1)).toBe(true)
  })
})

describe('rosterDelta', () => {
  it('adds new peers and excludes self', () => {
    expect(rosterDelta([], ['me', 'a', 'b'], 'me')).toEqual({ added: ['a', 'b'], removed: [] })
  })
  it('removes peers that left', () => {
    expect(rosterDelta(['a', 'b'], ['me', 'a'], 'me')).toEqual({ added: [], removed: ['b'] })
  })
  it('handles a simultaneous join and leave', () => {
    const d = rosterDelta(['a'], ['me', 'b'], 'me')
    expect(d.added).toEqual(['b'])
    expect(d.removed).toEqual(['a'])
  })
  it('is a no-op when the peer set is unchanged', () => {
    expect(rosterDelta(['a', 'b'], ['me', 'a', 'b'], 'me')).toEqual({ added: [], removed: [] })
  })
})

describe('levelFromSamples', () => {
  it('is 0 for silence (all samples at the 128 center)', () => {
    expect(levelFromSamples(new Uint8Array(64).fill(128))).toBe(0)
  })
  it('is 1 for a full-scale square wave', () => {
    const buf = new Uint8Array(64).fill(0)
    expect(levelFromSamples(buf)).toBe(1)
  })
  it('grows with amplitude', () => {
    const quiet = new Uint8Array(64).fill(132)
    const loud = new Uint8Array(64).fill(180)
    expect(levelFromSamples(quiet)).toBeLessThan(levelFromSamples(loud))
  })
  it('is 0 for an empty buffer', () => {
    expect(levelFromSamples(new Uint8Array(0))).toBe(0)
  })
})

describe('createMutedTalkingTracker', () => {
  const loud = VOICE_SPEAKING_THRESHOLD * 2
  const quiet = VOICE_SPEAKING_THRESHOLD / 2

  it('fires only after sustained speech while muted', () => {
    const tr = createMutedTalkingTracker()
    expect(tr.feed(true, loud, 0)).toBe(false)
    expect(tr.feed(true, loud, MUTED_TALKING_SUSTAIN_MS - 1)).toBe(false)
    expect(tr.feed(true, loud, MUTED_TALKING_SUSTAIN_MS)).toBe(true)
  })

  it('never fires while unmuted or quiet', () => {
    const tr = createMutedTalkingTracker()
    expect(tr.feed(false, loud, 0)).toBe(false)
    expect(tr.feed(false, loud, 10_000)).toBe(false)
    expect(tr.feed(true, quiet, 20_000)).toBe(false)
  })

  it('a pause resets the sustain window', () => {
    const tr = createMutedTalkingTracker()
    tr.feed(true, loud, 0)
    // Silence in between - the earlier onset no longer counts.
    tr.feed(true, quiet, 300)
    expect(tr.feed(true, loud, MUTED_TALKING_SUSTAIN_MS + 100)).toBe(false)
  })

  it('throttles repeat fires until the cooldown lapses', () => {
    const tr = createMutedTalkingTracker()
    tr.feed(true, loud, 0)
    expect(tr.feed(true, loud, MUTED_TALKING_SUSTAIN_MS)).toBe(true)
    expect(tr.feed(true, loud, MUTED_TALKING_SUSTAIN_MS + 1000)).toBe(false)
    expect(tr.feed(true, loud, MUTED_TALKING_SUSTAIN_MS + MUTED_TALKING_THROTTLE_MS)).toBe(true)
  })

  it('reset clears both the sustain window and the throttle', () => {
    const tr = createMutedTalkingTracker()
    tr.feed(true, loud, 0)
    expect(tr.feed(true, loud, MUTED_TALKING_SUSTAIN_MS)).toBe(true)
    tr.reset()
    expect(tr.feed(true, loud, MUTED_TALKING_SUSTAIN_MS + 1)).toBe(false)
    expect(tr.feed(true, loud, MUTED_TALKING_SUSTAIN_MS * 2 + 1)).toBe(true)
  })
})
