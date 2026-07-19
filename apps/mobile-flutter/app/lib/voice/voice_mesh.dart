// Pure helpers for the voice mesh (matching apps/web-nuxt/app/utils/voice.ts) -
// who offers, how a roster changes - unit-testable without a real peer connection.

/// Deterministic offerer for a pair, so the two sides never both offer (glare):
/// the lexicographically smaller id offers, the other waits.
bool shouldOffer(String selfId, String peerId) => selfId.compareTo(peerId) < 0;

/// Whether a fresh roster means the local call is established. A DM needs both
/// parties (>= 2); a league room is joined the moment the local member rosters
/// back (>= 1).
bool isCallEstablished(String scopeKind, int rosterLen) =>
    scopeKind == 'dm' ? rosterLen >= 2 : rosterLen >= 1;

class RosterDelta {
  const RosterDelta(this.added, this.removed);
  final List<String> added;
  final List<String> removed;
}

/// Diff a previous peer set against a fresh roster (both include self) - which
/// peers to connect to and which to tear down. Self is always excluded.
RosterDelta rosterDelta(Iterable<String> previous, List<String> roster, String selfId) {
  final prev = previous.toSet();
  final next = roster.where((id) => id != selfId).toSet();
  final added = next.where((id) => !prev.contains(id)).toList();
  final removed = prev.where((id) => !next.contains(id)).toList();
  return RosterDelta(added, removed);
}

/// m:ss under an hour, h:mm:ss from there.
String formatCallDuration(int totalSeconds) {
  final secs = totalSeconds < 0 ? 0 : totalSeconds;
  final h = secs ~/ 3600;
  final m = (secs % 3600) ~/ 60;
  final s = secs % 60;
  final ss = s.toString().padLeft(2, '0');
  if (h > 0) return '$h:${m.toString().padLeft(2, '0')}:$ss';
  return '$m:$ss';
}
