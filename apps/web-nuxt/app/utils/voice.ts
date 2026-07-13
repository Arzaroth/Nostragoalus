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

// Call-duration display: m:ss under an hour, h:mm:ss from there ("67:39" reads
// as minutes, "1:07:39" doesn't). Used by the in-call timer and the chat call
// lines.
export function formatCallDuration(totalSeconds: number): string {
  const secs = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

// === Connection quality (fed by RTCPeerConnection.getStats) ===

export type ConnectionQuality = 'good' | 'fair' | 'poor'

export interface RtcQualityInputs {
  rttMs: number | null
  lossFraction: number | null
  jitterMs: number | null
}

// Pull the three signals that matter for perceived audio quality out of a raw
// stats dump: round-trip time + loss as the REMOTE saw our audio
// (remote-inbound-rtp), jitter as we receive theirs (inbound-rtp).
export function extractQualityInputs(reports: Array<Record<string, unknown>>): RtcQualityInputs {
  let rttMs: number | null = null
  let lossFraction: number | null = null
  let jitterMs: number | null = null
  for (const r of reports) {
    if (r.type === 'remote-inbound-rtp' && r.kind === 'audio') {
      if (typeof r.roundTripTime === 'number') rttMs = r.roundTripTime * 1000
      if (typeof r.fractionLost === 'number') lossFraction = r.fractionLost
    } else if (r.type === 'inbound-rtp' && r.kind === 'audio' && typeof r.jitter === 'number') {
      jitterMs = r.jitter * 1000
    }
  }
  return { rttMs, lossFraction, jitterMs }
}

// Thresholds tuned for conversational audio: past ~250ms RTT talk-over starts,
// past ~2% loss artifacts become audible, past ~8% speech breaks up.
export function qualityOf(i: RtcQualityInputs): ConnectionQuality {
  const rtt = i.rttMs ?? 0
  const loss = i.lossFraction ?? 0
  const jitter = i.jitterMs ?? 0
  if (loss > 0.08 || rtt > 500 || jitter > 100) return 'poor'
  if (loss > 0.02 || rtt > 250 || jitter > 40) return 'fair'
  return 'good'
}

// A call is as good as its worst link (null = nothing to measure yet).
export function worstQuality(qs: readonly ConnectionQuality[]): ConnectionQuality | null {
  if (qs.length === 0) return null
  if (qs.includes('poor')) return 'poor'
  if (qs.includes('fair')) return 'fair'
  return 'good'
}

// getUserMedia audio constraints for a call. Echo cancellation and auto gain are
// always on (a speakerphone call without them howls); noise suppression is the
// user's toggle. A chosen device is `exact` so a switch never silently falls back.
export function buildAudioConstraints(deviceId: string | null, noiseSuppression: boolean): MediaTrackConstraints {
  return {
    echoCancellation: true,
    autoGainControl: true,
    noiseSuppression,
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  }
}

// getUserMedia failures that mean the SAVED input device is the problem (gone,
// or its exact-deviceId constraint unsatisfiable) - only these should clear the
// persisted preference. A permission or busy-hardware error is not the device's
// fault; forgetting the choice over one would lose it on any transient failure.
export function isDeviceGoneError(name: unknown): boolean {
  return name === 'OverconstrainedError' || name === 'NotFoundError'
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

// The in-call mic meter, a 5-bar mini waveform. Speech RMS lives in ~0.02-0.25,
// so the level is normalized against METER_LEVEL_FULL and sqrt-compressed:
// quiet speech already moves the bars instead of pinning them at the floor.
const METER_LEVEL_FULL = 0.25
const METER_BAR_MIN_PX = 3
const METER_BAR_MAX_PX = 14
// Center-peaked profile so the bars read as a wave, not a flat block.
const METER_BAR_PROFILE = [0.45, 0.75, 1, 0.75, 0.45]

export function meterBarHeights(level: number, muted: boolean): number[] {
  const norm = muted ? 0 : Math.sqrt(Math.min(Math.max(level, 0) / METER_LEVEL_FULL, 1))
  return METER_BAR_PROFILE.map(
    (p) => Math.round((METER_BAR_MIN_PX + (METER_BAR_MAX_PX - METER_BAR_MIN_PX) * norm * p) * 10) / 10,
  )
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
