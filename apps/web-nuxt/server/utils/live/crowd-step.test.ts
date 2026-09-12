import { describe, it, expect, beforeEach } from 'vitest'
import { crowdStepKey, resetCrowdSteps, shouldPublishCrowd } from './crowd-step'
import { MIN_CROWD_COUNT } from '../predictions/service'

beforeEach(() => {
  resetCrowdSteps()
})

describe('crowdStepKey', () => {
  it('keeps the global and per-league streams apart', () => {
    expect(crowdStepKey('m1')).toBe('global:m1')
    expect(crowdStepKey('m1', 'lg1')).toBe('league:lg1:m1')
    expect(crowdStepKey('m1', 'lg1')).not.toBe(crowdStepKey('m1', 'lg2'))
  })
})

describe('shouldPublishCrowd', () => {
  // withCrowdFloor has already blanked these to zeros, so they carry nothing to
  // leak - and a client whose total drops back under the floor has to be told.
  it('lets a blanked below-floor total through, and remembers nothing', () => {
    for (let n = 0; n < MIN_CROWD_COUNT; n++) {
      expect(shouldPublishCrowd('k', n)).toBe(true)
    }
    // The first real total still goes out, so no step was consumed above.
    expect(shouldPublishCrowd('k', MIN_CROWD_COUNT)).toBe(true)
  })

  it('publishes the first total that clears the floor', () => {
    expect(shouldPublishCrowd('k', MIN_CROWD_COUNT)).toBe(true)
  })

  // The bug this exists for: without the step, every save published a total
  // whose delta from the previous one was exactly the saved scoreline.
  it('does not publish again until a whole step of predictions has landed', () => {
    expect(shouldPublishCrowd('k', 3)).toBe(true)
    expect(shouldPublishCrowd('k', 4)).toBe(false)
    expect(shouldPublishCrowd('k', 5)).toBe(false)
    expect(shouldPublishCrowd('k', 6)).toBe(true)
    expect(shouldPublishCrowd('k', 7)).toBe(false)
  })

  // An edit moves the scoreline without moving the count, which would otherwise
  // publish a delta that is purely one user's change.
  it('does not publish a re-save that leaves the count unchanged', () => {
    expect(shouldPublishCrowd('k', 4 + MIN_CROWD_COUNT)).toBe(true)
    expect(shouldPublishCrowd('k', 4 + MIN_CROWD_COUNT)).toBe(false)
    expect(shouldPublishCrowd('k', 4 + MIN_CROWD_COUNT)).toBe(false)
  })

  it('tracks each stream independently', () => {
    expect(shouldPublishCrowd('global:m1', 3)).toBe(true)
    expect(shouldPublishCrowd('league:lg1:m1', 3)).toBe(true)
    expect(shouldPublishCrowd('global:m1', 4)).toBe(false)
    expect(shouldPublishCrowd('league:lg1:m1', 4)).toBe(false)
  })

  // A shrinking field (a prediction withdrawn, or an evicted counter that had
  // been tracking a larger one) must not unlock a publish on every save.
  it('restarts the step when the count goes backwards', () => {
    expect(shouldPublishCrowd('k', 10)).toBe(true)
    expect(shouldPublishCrowd('k', 5)).toBe(false)
    expect(shouldPublishCrowd('k', 6)).toBe(false)
    expect(shouldPublishCrowd('k', 5 + MIN_CROWD_COUNT)).toBe(true)
  })

  it('forgets a stream after its entry ages out, rather than holding it forever', () => {
    const day = 24 * 60 * 60 * 1000
    expect(shouldPublishCrowd('k', 3, 0)).toBe(true)
    expect(shouldPublishCrowd('k', 4, 0)).toBe(false)
    // Past the TTL the counter is gone, so the next total over the floor goes
    // out: a step early at worst, never a per-save stream.
    expect(shouldPublishCrowd('k', 4, day + 1)).toBe(true)
  })
})
