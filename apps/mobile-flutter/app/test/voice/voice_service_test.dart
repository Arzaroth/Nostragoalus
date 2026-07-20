import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:nostragoalus/api/api_client.dart';
import 'package:nostragoalus/api/models.gen.dart' show IceServer, IceServersResponse;
import 'package:nostragoalus/api/nostragoalus_api.dart';
import 'package:nostragoalus/api/token_store.dart';
import 'package:nostragoalus/live/live_service.dart';
import 'package:nostragoalus/voice/voice_service.dart';

import '../api/helpers.dart';
import '../live/fake_channel.dart';
import 'fakes.dart';

const _iceReply = {
  'iceServers': [
    {'urls': 'stun:stun.example:3478'},
  ],
  'ttl': 3600,
};

const _scope = VoiceScope.dm('t1');
const _scopeJson = {'kind': 'dm', 'threadId': 't1'};

class Harness {
  Harness({
    Object iceBody = _iceReply,
    int iceStatus = 200,
    Future<MediaStream> Function()? media,
    IceFetcher? ice,
    Duration iceRetry = const Duration(seconds: 30),
  }) {
    final client = ApiClient(
      TokenStore(InMemoryKv()),
      dio: Dio()..httpClientAdapter = FakeAdapter([Reply(iceStatus, iceBody)]),
    );
    live = LiveService(
      TokenStore(InMemoryKv()),
      channelFactory: channels.factory,
      heartbeatInterval: const Duration(seconds: 30),
      heartbeatTimeout: const Duration(seconds: 30),
      retryBase: const Duration(milliseconds: 5),
      retryCap: const Duration(milliseconds: 5),
    );
    voice = VoiceService(
      NostragoalusApi(client),
      TokenStore(InMemoryKv()),
      'self',
      media: media ?? (() async => stream),
      peers: (config) async {
        final peer = FakePeer(config);
        peers.add(peer);
        return peer;
      },
      ice: ice,
      ringTimeout: const Duration(milliseconds: 40),
      reconnectGrace: const Duration(milliseconds: 40),
      iceRetry: iceRetry,
    );
    live.connect();
    voice.attach(live);
  }

  final channels = FakeChannels();
  final stream = FakeStream();
  final peers = <FakePeer>[];
  late final LiveService live;
  late final VoiceService voice;

  FakeChannel get socket => channels.last;
  List<Map<String, dynamic>> sentOf(String type) => socket.ofType(type);

  void emit(Map<String, dynamic> frame) => socket.emit(frame);

  void roster(List<String> ids) => emit({
        'type': 'voice:roster',
        'roomKey': 'dm:t1',
        'scope': _scopeJson,
        'roster': ids,
        'names': const <String, String>{},
      });

  Future<void> dispose() async {
    await voice.dispose();
    live.dispose();
  }
}

void main() {
  test('join needs the shared hub socket', () async {
    final voice = VoiceService(
      NostragoalusApi(ApiClient(TokenStore(InMemoryKv()))),
      TokenStore(InMemoryKv()),
      'self',
    );
    await expectLater(voice.join(_scope), throwsA(isA<StateError>()));
    await voice.dispose();
  });

  test('join sends voice:join and lands in-call on the right scope', () async {
    final h = Harness();
    await h.voice.join(_scope);
    expect(h.sentOf('voice:join').single['scope'], _scopeJson);
    expect(h.voice.activeScope, _scope);
    expect(h.voice.state.value, isA<VoiceInCall>());
    // Another room's bar must not see itself as active.
    expect(h.voice.activeScope == const VoiceScope.league('lg'), isFalse);
    await h.dispose();
  });

  test('a roster delta opens a peer and offers when we are the offerer', () async {
    final h = Harness();
    await h.voice.join(_scope);
    h.roster(['self', 'zzz']);
    await settle();

    expect(h.peers, hasLength(1));
    expect(h.peers.single.config['iceServers'], [
      {'urls': 'stun:stun.example:3478'},
    ]);
    expect(h.peers.single.addedTracks, hasLength(1));
    final offer = h.sentOf('voice:signal').single;
    expect(offer['kind'], 'offer');
    expect(offer['to'], 'zzz');

    // A peer leaving the roster tears its connection down.
    h.roster(['self']);
    await settle();
    expect(h.peers.single.closed, isTrue);
    await h.dispose();
  });

  test('trickle ICE uses the server kind (ice) in both directions', () async {
    final h = Harness();
    await h.voice.join(_scope);
    h.roster(['self', 'zzz']);
    await settle();

    h.peers.single.onIceCandidate!(RTCIceCandidate('cand-out', '0', 0));
    final outbound = h.sentOf('voice:signal').firstWhere((f) => f['kind'] == 'ice');
    expect(outbound['payload'], {'candidate': 'cand-out', 'sdpMid': '0', 'sdpMLineIndex': 0});

    h.emit({
      'type': 'voice:signal',
      'from': 'zzz',
      'kind': 'ice',
      'payload': {'candidate': 'cand-in', 'sdpMid': '0', 'sdpMLineIndex': 0},
    });
    await settle();
    expect(h.peers.single.candidates.single.candidate, 'cand-in');
    await h.dispose();
  });

  test('an inbound offer is answered, an answer is applied', () async {
    final h = Harness();
    await h.voice.join(_scope);
    h.emit({
      'type': 'voice:signal',
      'from': 'aaa',
      'kind': 'offer',
      'payload': {'sdp': 'their-sdp', 'type': 'offer'},
    });
    await settle();
    final answer = h.sentOf('voice:signal').single;
    expect(answer['kind'], 'answer');
    expect(answer['to'], 'aaa');
    expect(h.peers.single.descriptions, ['remote:offer', 'local:answer']);

    h.emit({
      'type': 'voice:signal',
      'from': 'aaa',
      'kind': 'answer',
      'payload': {'sdp': 'their-sdp', 'type': 'answer'},
    });
    await settle();
    expect(h.peers.single.descriptions.last, 'remote:answer');
    await h.dispose();
  });

  test('voice:peer-reset drops AND re-establishes the peer', () async {
    final h = Harness();
    await h.voice.join(_scope);
    h.roster(['self', 'zzz']);
    await settle();

    h.emit({'type': 'voice:peer-reset', 'userId': 'zzz'});
    await settle();

    expect(h.peers, hasLength(2), reason: 'a takeover needs a fresh connection');
    expect(h.peers.first.closed, isTrue);
    expect(h.peers.last.closed, isFalse);
    await h.dispose();
  });

  test('leave tells the server, closes peers and releases the mic', () async {
    final h = Harness();
    await h.voice.join(_scope);
    h.roster(['self', 'zzz']);
    await settle();

    await h.voice.leave();

    expect(h.sentOf('voice:leave'), hasLength(1));
    expect(h.peers.single.closed, isTrue);
    expect(h.stream.tracks.single.stopped, isTrue);
    expect(h.stream.disposed, isTrue);
    expect(h.voice.state.value, isA<VoiceIdle>());
    expect(h.voice.activeScope, isNull);
    await h.dispose();
  });

  test('ended and evicted tear down without telling the server we left', () async {
    for (final type in ['voice:ended', 'voice:evicted']) {
      final h = Harness();
      await h.voice.join(_scope);
      h.emit({'type': type, 'scope': _scopeJson, 'from': 'zzz'});
      await settle();
      expect(h.voice.state.value, isA<VoiceIdle>(), reason: type);
      expect(h.sentOf('voice:leave'), isEmpty, reason: type);
      await h.dispose();
    }
  });

  test('an unanswered ring is cancelled at the timeout, not just left', () async {
    final h = Harness();
    await h.voice.invite(_scope, ['zzz']);
    expect(h.sentOf('voice:invite').single['userIds'], ['zzz']);

    await settle(60);

    final cancel = h.sentOf('voice:cancel').single;
    expect(cancel['to'], 'zzz');
    expect(cancel['scope'], _scopeJson);
    expect(h.sentOf('voice:leave'), hasLength(1));
    expect(h.voice.state.value, isA<VoiceIdle>());
    await h.dispose();
  });

  test('hanging up on a ringing callee cancels their ring too', () async {
    final h = Harness();
    await h.voice.invite(_scope, ['zzz']);
    await h.voice.leave();
    expect(h.sentOf('voice:cancel').single['to'], 'zzz');
    await h.dispose();
  });

  test('a callee who answers stops the cancel timer', () async {
    final h = Harness();
    await h.voice.invite(_scope, ['zzz']);
    h.roster(['self', 'zzz']);
    await settle(60);
    expect(h.sentOf('voice:cancel'), isEmpty);
    expect(h.voice.state.value, isA<VoiceInCall>());
    await h.dispose();
  });

  test('a declined call ends the caller-side call', () async {
    final h = Harness();
    await h.voice.invite(_scope, ['zzz']);
    h.emit({'type': 'voice:declined', 'scope': _scopeJson, 'from': 'zzz'});
    await settle();
    expect(h.voice.state.value, isA<VoiceIdle>());
    // Declined is an explicit answer: no missed-call cancel on top of it.
    expect(h.sentOf('voice:cancel'), isEmpty);
    await h.dispose();
  });

  test('a socket drop suspends the call, and the reconnect re-joins the room', () async {
    final h = Harness();
    await h.voice.join(_scope);
    h.roster(['self', 'zzz']);
    await settle();

    await h.socket.drop();
    await settle();
    final suspended = h.voice.state.value;
    expect(suspended, isA<VoiceConnecting>());
    expect((suspended as VoiceConnecting).reconnecting, isTrue);

    await settle(30);
    expect(h.voice.state.value, isA<VoiceInCall>());
    expect(h.sentOf('voice:join'), hasLength(1), reason: 're-joined on the new socket');
    expect(h.peers.single.closed, isTrue, reason: 'the old peer link is dead');
    await h.dispose();
  });

  test('a socket that never comes back ends the call with a reason', () async {
    final h = Harness();
    await h.voice.join(_scope);
    final states = <VoiceCallState>[];
    h.voice.state.addListener(() => states.add(h.voice.state.value));

    await h.socket.drop();
    // The hub never comes back (airplane mode, not a blip).
    h.live.disconnect();
    await settle(80);

    expect(states.whereType<VoiceEnding>().single.reason, VoiceEndReason.networkLost);
    expect(h.voice.state.value, isA<VoiceIdle>());
    await h.dispose();
  });

  test('a join with no ICE servers fails loudly and rolls back', () async {
    final h = Harness(iceBody: const {'iceServers': [], 'ttl': 0});
    await expectLater(h.voice.join(_scope), throwsA(isA<VoiceJoinException>()));
    expect(h.voice.state.value, isA<VoiceIdle>());
    expect(h.voice.activeScope, isNull);
    expect(h.sentOf('voice:join'), isEmpty);
    await h.dispose();
  });

  test('a denied microphone rolls back and says so', () async {
    final h = Harness(media: () async => throw Exception('permission denied'));
    try {
      await h.voice.join(_scope);
      fail('join should have thrown');
    } on VoiceJoinException catch (e) {
      expect(e.micDenied, isTrue);
    }
    expect(h.voice.state.value, isA<VoiceIdle>());
    await h.dispose();
  });

  test('a failed ICE fetch rolls back the mic it never got to use', () async {
    final h = Harness(iceStatus: 500, iceBody: const {'error': 'boom'});
    await expectLater(h.voice.join(_scope), throwsA(isA<VoiceJoinException>()));
    expect(h.stream.tracks.single.stopped, isFalse, reason: 'never acquired');
    expect(h.voice.state.value, isA<VoiceIdle>());
    await h.dispose();
  });

  test('mute flips the local audio tracks and the state together', () async {
    final h = Harness();
    await h.voice.join(_scope);
    h.voice.toggleMute();
    expect((h.voice.state.value as VoiceInCall).muted, isTrue);
    expect(h.stream.tracks.single.enabled, isFalse);
    h.voice.toggleMute();
    expect((h.voice.state.value as VoiceInCall).muted, isFalse);
    expect(h.stream.tracks.single.enabled, isTrue);
    await h.dispose();
  });

  test('dispose during teardown never writes a disposed notifier', () async {
    final h = Harness();
    await h.voice.join(_scope);
    h.roster(['self', 'zzz']);
    await settle();
    await h.voice.dispose();
    // A late frame after dispose must not resurrect anything.
    h.emit({'type': 'voice:ended', 'scope': _scopeJson, 'from': 'zzz'});
    await settle();
    h.live.dispose();
  });

  test('the TURN credential is refreshed before its ttl and pushed to live peers', () async {
    var fetches = 0;
    final h = Harness(ice: () async {
      fetches += 1;
      // 50ms of credit: the refresh is armed at 90% of it.
      return IceServersResponse(iceServers: [IceServer(urls: 'turn:cred-$fetches')], ttl: 0.05);
    });
    await h.voice.join(_scope);
    h.roster(['self', 'zzz']);
    await settle();
    expect(h.peers.single.config['iceServers'], [
      {'urls': 'turn:cred-1'},
    ]);

    await settle(80);
    expect(fetches, greaterThan(1), reason: 'the credential lapses mid-call');
    expect(h.peers.single.reconfigured.last['iceServers'], [
      {'urls': 'turn:cred-$fetches'},
    ]);
    // A call ending stops the refresh loop.
    await h.voice.leave();
    final settled = fetches;
    await settle(80);
    expect(fetches, settled);
    await h.dispose();
  });

  test('a refresh that fails mid-call keeps the call up and retries', () async {
    var fetches = 0;
    final h = Harness(
      iceRetry: const Duration(milliseconds: 60),
      ice: () async {
        fetches += 1;
        if (fetches == 1) {
          return IceServersResponse(iceServers: [IceServer(urls: 'turn:first')], ttl: 0.05);
        }
        if (fetches == 2) throw Exception('ice endpoint down');
        return IceServersResponse(iceServers: [IceServer(urls: 'turn:later')], ttl: 3600);
      },
    );
    await h.voice.join(_scope);
    h.roster(['self', 'zzz']);
    await settle();

    await settle(70);
    expect(h.voice.state.value, isA<VoiceInCall>(), reason: 'a blip must not drop the call');
    expect(h.peers.single.config['iceServers'], [
      {'urls': 'turn:first'},
    ], reason: 'the credential we still have is kept');

    await settle(90);
    expect(h.peers.single.reconfigured.last['iceServers'], [
      {'urls': 'turn:later'},
    ]);
    await h.dispose();
  });

  test('backgrounding ends the call instead of listing a dead microphone', () async {
    final h = Harness();
    await h.voice.join(_scope);
    final states = <VoiceCallState>[];
    h.voice.state.addListener(() => states.add(h.voice.state.value));

    expect(await h.voice.backgrounded(), isTrue);
    expect(states.whereType<VoiceEnding>().single.reason, VoiceEndReason.backgrounded);
    expect(h.voice.state.value, isA<VoiceIdle>());
    expect(h.sentOf('voice:leave'), hasLength(1));
    expect(h.stream.tracks.single.stopped, isTrue);

    // Nothing to end means nothing to explain to the user.
    expect(await h.voice.backgrounded(), isFalse);
    await h.dispose();
  });

  test('a roster for another room is ignored', () async {
    final h = Harness();
    await h.voice.join(_scope);
    h.emit({
      'type': 'voice:roster',
      'roomKey': 'league:lg',
      'scope': const {'kind': 'league', 'leagueId': 'lg'},
      'roster': ['self', 'zzz'],
      'names': const <String, String>{},
    });
    await settle();
    expect(h.peers, isEmpty);
    await h.dispose();
  });
}
