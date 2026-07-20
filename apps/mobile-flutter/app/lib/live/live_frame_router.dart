import 'live_service.dart';

/// Turns hub frames into app-level events. It lives outside the widget tree so
/// the shape of every server frame (server/utils/live/hub.ts, voice.ts) can be
/// unit-tested without mounting the shell; the callbacks do the actual provider
/// writes.
class LiveFrameRouter {
  const LiveFrameRouter({
    this.onMatches,
    this.onMatch,
    this.onNotifications,
    this.onReactions,
    this.onViewers,
    this.onPresenceSnapshot,
    this.onPresence,
    this.onTyping,
    this.onRing,
    this.onRingCancelled,
  });

  /// Any live score change: the fixtures list is stale.
  final void Function()? onMatches;

  /// The one match a `match:update` carries.
  final void Function(String matchId)? onMatch;
  final void Function()? onNotifications;
  final void Function(String matchId)? onReactions;
  final void Function(String matchId, int count)? onViewers;
  final void Function(Map<String, String> users)? onPresenceSnapshot;

  /// A null status means the user went offline and should be dropped from the
  /// map rather than stored (an 'offline' entry would accumulate forever).
  final void Function(String userId, String? status)? onPresence;
  final void Function(String leagueId, String userId)? onTyping;

  /// An incoming call, and the caller giving up on it.
  final void Function(Map<String, dynamic> frame)? onRing;
  final void Function(String from)? onRingCancelled;

  void handle(LiveFrame frame) {
    switch (frame['type']) {
      case 'match:update':
        onMatches?.call();
        final id = (frame['match'] as Map?)?['id'];
        if (id is String) onMatch?.call(id);
      case 'scores:changed':
        onMatches?.call();
      case 'notification:new':
        onNotifications?.call();
      case 'reaction:update':
        final id = frame['matchId'];
        if (id is String) onReactions?.call(id);
      case 'viewers:update':
        final id = frame['matchId'];
        final count = frame['count'];
        if (id is String && count is num) onViewers?.call(id, count.toInt());
      case 'presence:snapshot':
        final users = frame['users'];
        if (users is Map) {
          onPresenceSnapshot?.call(users.map((k, v) => MapEntry(k.toString(), v.toString())));
        }
      case 'presence:update':
        final id = frame['userId'];
        final status = frame['status'];
        if (id is String && status is String) {
          onPresence?.call(id, status == 'offline' ? null : status);
        }
      case 'chat:typing':
        final league = frame['leagueId'];
        final who = frame['userId'];
        if (league is String && who is String) onTyping?.call(league, who);
      case 'voice:ring':
        onRing?.call(frame);
      case 'voice:cancelled':
        final from = frame['from'];
        if (from is String) onRingCancelled?.call(from);
    }
  }
}
