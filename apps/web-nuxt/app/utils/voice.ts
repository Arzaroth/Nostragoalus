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
