import 'voice_mesh.dart';

/// The closed set of call scopes (apps/web-nuxt/shared/types/voice.ts).
enum VoiceKind { dm, league }

/// A voice room to join (a league room, optionally per-match, or a 1:1 DM call).
class VoiceScope {
  const VoiceScope({required this.kind, this.leagueId, this.matchId, this.threadId});

  const VoiceScope.dm(String threadId) : this(kind: VoiceKind.dm, threadId: threadId);

  const VoiceScope.league(String leagueId, {String? matchId})
      : this(kind: VoiceKind.league, leagueId: leagueId, matchId: matchId);

  final VoiceKind kind;
  final String? leagueId;
  final String? matchId;
  final String? threadId;

  factory VoiceScope.fromJson(Map<String, dynamic> j) => VoiceScope(
        kind: j['kind'] == 'league' ? VoiceKind.league : VoiceKind.dm,
        leagueId: j['leagueId'] as String?,
        matchId: j['matchId'] as String?,
        threadId: j['threadId'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'kind': kind.name,
        if (leagueId != null) 'leagueId': leagueId,
        if (matchId != null) 'matchId': matchId,
        if (threadId != null) 'threadId': threadId,
      };

  @override
  bool operator ==(Object other) =>
      other is VoiceScope &&
      other.kind == kind &&
      other.leagueId == leagueId &&
      other.matchId == matchId &&
      other.threadId == threadId;

  @override
  int get hashCode => Object.hash(kind, leagueId, matchId, threadId);
}

/// Why a call stopped, so the UI can say something other than "gone".
enum VoiceEndReason { hangUp, declined, cancelled, ended, evicted, networkLost, failed }

/// The whole call lifecycle in one value: there is no "connected but scopeless"
/// combination to get wrong.
sealed class VoiceCallState {
  const VoiceCallState();

  /// The scope this state belongs to, or null when no call is up. `VoiceBar`
  /// compares it against its own scope so only the bar of the active room
  /// renders in-call controls.
  VoiceScope? get scope => null;
}

class VoiceIdle extends VoiceCallState {
  const VoiceIdle();
}

class VoiceConnecting extends VoiceCallState {
  const VoiceConnecting(this.scope, {this.reconnecting = false, this.muted = false});
  @override
  final VoiceScope scope;
  final bool reconnecting;

  /// Carried across a reconnect so a muted user does not come back live.
  final bool muted;
}

class VoiceInCall extends VoiceCallState {
  const VoiceInCall({
    required this.scope,
    required this.roster,
    required this.muted,
    required this.startedAt,
  });
  @override
  final VoiceScope scope;
  final List<String> roster;
  final bool muted;
  final DateTime startedAt;

  /// A DM is only really a call once the other side is in; a league room counts
  /// from the local member's own roster entry.
  bool get established => isCallEstablished(scope.kind.name, roster.length);

  VoiceInCall copyWith({List<String>? roster, bool? muted}) => VoiceInCall(
        scope: scope,
        roster: roster ?? this.roster,
        muted: muted ?? this.muted,
        startedAt: startedAt,
      );
}

/// Teardown is in flight (peers closing, mic stopping); settles to VoiceIdle.
class VoiceEnding extends VoiceCallState {
  const VoiceEnding(this.reason);
  final VoiceEndReason reason;
}
