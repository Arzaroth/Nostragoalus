import { describe, expect, it } from 'vitest'
import {
  MUTED_TALKING_SUSTAIN_MS,
  MUTED_TALKING_THROTTLE_MS,
  VOICE_SPEAKING_THRESHOLD,
  buildAudioConstraints,
  createMutedTalkingTracker,
  extractQualityInputs,
  formatCallDuration,
  isCallEstablished,
  isDeviceGoneError,
  levelFromSamples,
  qualityOf,
  rosterDelta,
  shouldOffer,
  worstQuality,
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

describe('buildAudioConstraints', () => {
  it('always requests echo cancellation and auto gain', () => {
    expect(buildAudioConstraints(null, true)).toEqual({
      echoCancellation: true,
      autoGainControl: true,
      noiseSuppression: true,
    })
  })
  it('passes the noise-suppression toggle through', () => {
    expect(buildAudioConstraints(null, false).noiseSuppression).toBe(false)
  })
  it('pins a chosen device with exact', () => {
    expect(buildAudioConstraints('mic1', true).deviceId).toEqual({ exact: 'mic1' })
  })
})

describe('connection quality', () => {
  it('extracts rtt + loss from remote-inbound and jitter from inbound audio stats', () => {
    const inputs = extractQualityInputs([
      { type: 'remote-inbound-rtp', kind: 'audio', roundTripTime: 0.2, fractionLost: 0.01 },
      { type: 'inbound-rtp', kind: 'audio', jitter: 0.015 },
      { type: 'remote-inbound-rtp', kind: 'video', roundTripTime: 9 },
      { type: 'candidate-pair', currentRoundTripTime: 9 },
    ])
    expect(inputs).toEqual({ rttMs: 200, lossFraction: 0.01, jitterMs: 15 })
  })

  it('returns nulls when the stats carry no audio reports', () => {
    expect(extractQualityInputs([{ type: 'transport' }])).toEqual({ rttMs: null, lossFraction: null, jitterMs: null })
  })

  it('grades good, fair and poor by loss, rtt and jitter thresholds', () => {
    expect(qualityOf({ rttMs: 100, lossFraction: 0.01, jitterMs: 10 })).toBe('good')
    expect(qualityOf({ rttMs: 300, lossFraction: 0, jitterMs: 0 })).toBe('fair')
    expect(qualityOf({ rttMs: 0, lossFraction: 0.05, jitterMs: 0 })).toBe('fair')
    expect(qualityOf({ rttMs: 0, lossFraction: 0, jitterMs: 60 })).toBe('fair')
    expect(qualityOf({ rttMs: 600, lossFraction: 0, jitterMs: 0 })).toBe('poor')
    expect(qualityOf({ rttMs: 0, lossFraction: 0.1, jitterMs: 0 })).toBe('poor')
    expect(qualityOf({ rttMs: 0, lossFraction: 0, jitterMs: 150 })).toBe('poor')
  })

  it('treats missing signals as fine (a fresh link is not flagged)', () => {
    expect(qualityOf({ rttMs: null, lossFraction: null, jitterMs: null })).toBe('good')
  })

  it('worstQuality: worst link wins, null with no links', () => {
    expect(worstQuality([])).toBeNull()
    expect(worstQuality(['good', 'good'])).toBe('good')
    expect(worstQuality(['good', 'fair'])).toBe('fair')
    expect(worstQuality(['fair', 'poor', 'good'])).toBe('poor')
  })
})

describe('isDeviceGoneError', () => {
  it('flags the errors that mean the saved device is gone', () => {
    expect(isDeviceGoneError('OverconstrainedError')).toBe(true)
    expect(isDeviceGoneError('NotFoundError')).toBe(true)
  })
  it('spares permission and busy-hardware errors (and junk)', () => {
    expect(isDeviceGoneError('NotAllowedError')).toBe(false)
    expect(isDeviceGoneError('NotReadableError')).toBe(false)
    expect(isDeviceGoneError(undefined)).toBe(false)
  })
})

describe('formatCallDuration', () => {
  it('m:ss under an hour', () => {
    expect(formatCallDuration(0)).toBe('0:00')
    expect(formatCallDuration(59)).toBe('0:59')
    expect(formatCallDuration(65)).toBe('1:05')
    expect(formatCallDuration(3599)).toBe('59:59')
  })
  it('h:mm:ss from an hour up', () => {
    expect(formatCallDuration(3600)).toBe('1:00:00')
    expect(formatCallDuration(4059)).toBe('1:07:39')
    expect(formatCallDuration(7325)).toBe('2:02:05')
  })
  it('clamps negatives and floors fractions', () => {
    expect(formatCallDuration(-5)).toBe('0:00')
    expect(formatCallDuration(61.9)).toBe('1:01')
  })
})
