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
