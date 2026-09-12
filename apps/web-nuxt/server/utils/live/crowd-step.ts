import { createTtlCache } from '../cache/ttl-cache'
import { MIN_CROWD_COUNT } from '../predictions/service'

// MIN_CROWD_COUNT hides the standing crowd total below the floor, but it says
// nothing about the DELTA between two totals, and the totals are pushed live on
// every save. Once a match is over the floor, consecutive pushes differ by
// exactly one prediction, so `(home2 - home1, away2 - away1)` is that
// prediction's exact scoreline and `count + 1` confirms it came from a single
// pick - a pre-kickoff pick that is supposed to still be secret. An edit is
// worse: the count does not move at all, so the delta is purely that user's
// change.
//
// So gate the push instead of the value: a published total may never advance by
// fewer than MIN_CROWD_COUNT predictions, which makes every observable delta the
// blend of at least that many picks. The cost is that the crowd line steps
// rather than ticks, which is the same trade the floor already makes.
//
// Per process, like the other live-hub state. A second app instance would keep
// its own counters and each would still enforce the step on its own stream;
// going multi-instance is already a bigger change than this (see ROADMAP).
const lastPublished = createTtlCache<string, number>({
  // Long enough to cover a pick window (matches open days ahead), bounded so a
  // long-lived process cannot accumulate an entry per match per league forever.
  // An evicted entry only means the next push happens a step early, which is at
  // worst today's behaviour for one update.
  ttlMs: 24 * 60 * 60 * 1000,
  maxSize: 5000,
})

export function crowdStepKey(matchId: string, leagueId?: string): string {
  return leagueId ? `league:${leagueId}:${matchId}` : `global:${matchId}`
}

// True when this total may be published: either it is the first one over the
// anonymity floor, or at least MIN_CROWD_COUNT further predictions have landed
// since the last total that went out on this stream.
export function shouldPublishCrowd(key: string, count: number, now?: number): boolean {
  // Below the floor withCrowdFloor has already blanked the total to zeros, so
  // there is nothing to leak: let it through (a client whose total drops back
  // under the floor has to be told) and remember nothing.
  if (count < MIN_CROWD_COUNT) return true

  const last = lastPublished.get(key, now)
  // A count that went backwards (a prediction removed, or an evicted entry that
  // had been counting a larger field) restarts the step from here rather than
  // unlocking a publish on every save.
  if (last !== undefined && count < last) {
    lastPublished.set(key, count, now)
    return false
  }
  if (last !== undefined && count - last < MIN_CROWD_COUNT) return false

  lastPublished.set(key, count, now)
  return true
}

export function resetCrowdSteps(): void {
  lastPublished.clear()
}
