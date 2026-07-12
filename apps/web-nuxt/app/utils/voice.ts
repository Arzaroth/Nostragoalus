// Pure helpers for the voice mesh - the parts of the WebRTC dance that are plain
// logic (who offers, how a roster changes), split out of useVoiceCall so they are
// unit-testable without a real RTCPeerConnection.

// Deterministic offerer for a pair, so the two sides never both send an offer
// (glare). The peer with the lexicographically smaller id offers; the other waits.
// Works for late-join too: when C joins A + B, each existing member and C apply the
// same rule to the new pair, so exactly one side of each pair offers.
export function shouldOffer(selfId: string, peerId: string): boolean {
  return selfId < peerId
}

// Whether a freshly-received roster means the local call is now established, so the
// UI can leave its pre-connected state (outgoing / connecting). A DM ring is only
// "in call" once both parties are present (roster >= 2); a league room is a
// join-any-time space, so the local member is in the call the moment their own join
// rosters back (>= 1), even before anyone else arrives.
export function isCallEstablished(scopeKind: 'dm' | 'league', rosterLen: number): boolean {
  return scopeKind === 'dm' ? rosterLen >= 2 : rosterLen >= 1
}

export interface RosterDelta {
  // Peers to open a connection to (in the new roster, not before, never self).
  added: string[]
  // Peers that left (in the old set, gone now) - close and drop them.
  removed: string[]
}

// Diff a previous peer set against a fresh roster (both include self), returning
// which peers to connect to and which to tear down. Self is always excluded.
export function rosterDelta(previous: Iterable<string>, roster: readonly string[], selfId: string): RosterDelta {
  const prev = new Set(previous)
  const next = new Set(roster.filter((id) => id !== selfId))
  const added = [...next].filter((id) => !prev.has(id))
  const removed = [...prev].filter((id) => !next.has(id))
  return { added, removed }
}

// RMS level above which a stream counts as someone speaking. Time-domain RMS of
// normal speech sits well above this; keyboard/breath noise stays below.
export const VOICE_SPEAKING_THRESHOLD = 0.04
// Speech must hold this long while muted before the "you're muted" nudge fires,
// so a cough or a chair squeak does not toast.
export const MUTED_TALKING_SUSTAIN_MS = 600
// Minimum gap between two nudges - the user heard it, no need to nag every tick.
export const MUTED_TALKING_THROTTLE_MS = 15_000

// RMS of one AnalyserNode time-domain snapshot (bytes centered on 128) -> 0..1.
export function levelFromSamples(samples: Uint8Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (const s of samples) {
    const d = (s - 128) / 128
    sum += d * d
  }
  return Math.sqrt(sum / samples.length)
}

export interface MutedTalkingTracker {
  // Feed one meter tick; returns true when the "you're muted" nudge should fire.
  feed: (muted: boolean, level: number, now: number) => boolean
  reset: () => void
}

// Stateful detector for talking while muted: sustained speech-level input while
// muted fires once, then throttles.
export function createMutedTalkingTracker(): MutedTalkingTracker {
  let speechStart: number | null = null
  let lastFired = Number.NEGATIVE_INFINITY
  return {
    feed(muted, level, now) {
      if (!muted || level < VOICE_SPEAKING_THRESHOLD) {
        speechStart = null
        return false
      }
      speechStart ??= now
      if (now - speechStart >= MUTED_TALKING_SUSTAIN_MS && now - lastFired >= MUTED_TALKING_THROTTLE_MS) {
        lastFired = now
        return true
      }
      return false
    },
    reset() {
      speechStart = null
      lastFired = Number.NEGATIVE_INFINITY
    },
  }
}
