import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/live/live_frame_router.dart';

/// Frames exactly as the hub emits them (server/utils/live/hub.ts, voice.ts).
void main() {
  late List<String> calls;
  late LiveFrameRouter router;

  setUp(() {
    calls = [];
    router = LiveFrameRouter(
      onMatches: () => calls.add('matches'),
      onMatch: (id) => calls.add('match:$id'),
      onNotifications: () => calls.add('notifications'),
      onReactions: (id) => calls.add('reactions:$id'),
      onViewers: (id, n) => calls.add('viewers:$id=$n'),
      onPresenceSnapshot: (users) => calls.add('snapshot:$users'),
      onPresence: (id, status) => calls.add('presence:$id=$status'),
      onTyping: (league, who) => calls.add('typing:$league/$who'),
      onDmTyping: (thread, who) => calls.add('dmTyping:$thread/$who'),
      onRing: (f) => calls.add('ring:${f['from']}'),
      onRingCancelled: (from) => calls.add('cancelled:$from'),
      onCallLog: (league, thread) => calls.add('callLog:$league/$thread'),
    );
  });

  test('match:update carries the id inside match, not at the top level', () {
    router.handle({
      'type': 'match:update',
      'match': {'id': 'm1', 'status': 'LIVE', 'homeScore': 1},
    });
    expect(calls, ['matches', 'match:m1']);
  });

  test('scores:changed only nudges the fixtures list', () {
    router.handle({'type': 'scores:changed'});
    expect(calls, ['matches']);
  });

  test('viewers, reactions and notifications route to their reads', () {
    router.handle({'type': 'viewers:update', 'matchId': 'm1', 'count': 3});
    router.handle({'type': 'reaction:update', 'matchId': 'm1', 'totals': {}});
    router.handle({'type': 'notification:new'});
    expect(calls, ['viewers:m1=3', 'reactions:m1', 'notifications']);
  });

  test('presence: offline is a removal, not a stored status', () {
    router.handle({'type': 'presence:update', 'userId': 'u1', 'status': 'active'});
    router.handle({'type': 'presence:update', 'userId': 'u1', 'status': 'idle'});
    router.handle({'type': 'presence:update', 'userId': 'u1', 'status': 'offline'});
    expect(calls, ['presence:u1=active', 'presence:u1=idle', 'presence:u1=null']);
  });

  test('presence:snapshot stringifies the whole map', () {
    router.handle({
      'type': 'presence:snapshot',
      'users': {'u1': 'active', 'u2': 'idle'},
    });
    expect(calls, ['snapshot:{u1: active, u2: idle}']);
  });

  test('chat:typing routes league and user', () {
    router.handle({'type': 'chat:typing', 'leagueId': 'lg', 'userId': 'u2'});
    expect(calls, ['typing:lg/u2']);
  });

  test('dm:typing routes thread and user, and never as a league hint', () {
    router.handle({'type': 'dm:typing', 'threadId': 't7', 'userId': 'u2'});
    // A malformed frame is dropped rather than keyed on a null thread.
    router.handle({'type': 'dm:typing', 'userId': 'u2'});
    expect(calls, ['dmTyping:t7/u2']);
  });

  test('a ring and the caller giving up are both terminal-handled', () {
    router.handle({
      'type': 'voice:ring',
      'scope': {'kind': 'dm', 'threadId': 't1'},
      'from': 'u9',
      'fromName': 'Alice',
    });
    router.handle({
      'type': 'voice:cancelled',
      'scope': {'kind': 'dm', 'threadId': 't1'},
      'from': 'u9',
    });
    expect(calls, ['ring:u9', 'cancelled:u9']);
  });

  // The server flattens the scope onto the frame - one id set, the other absent
  // - and the room's call-log read is keyed on exactly that pair.
  test('voice:log carries whichever room id the scope had', () {
    router.handle({'type': 'voice:log', 'leagueId': 'l1', 'matchId': null});
    router.handle({'type': 'voice:log', 'threadId': 't1'});
    expect(calls, ['callLog:l1/null', 'callLog:null/t1']);
  });

  test('unknown and malformed frames are ignored', () {
    router.handle({'type': 'voice:roster', 'roster': []});
    router.handle({'type': 'match:update'});
    router.handle({'type': 'viewers:update', 'matchId': 'm1'});
    router.handle({'type': 'presence:update', 'userId': 42, 'status': 'active'});
    expect(calls, ['matches']);
  });
}
