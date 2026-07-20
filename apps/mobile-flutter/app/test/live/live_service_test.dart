import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/token_store.dart';
import 'package:nostragoalus/live/live_service.dart';

import '../api/helpers.dart';
import 'fake_channel.dart';

LiveService _service(FakeChannels channels) => LiveService(
      TokenStore(InMemoryKv()),
      channelFactory: channels.factory,
      heartbeatInterval: const Duration(milliseconds: 20),
      heartbeatTimeout: const Duration(milliseconds: 20),
      retryBase: const Duration(milliseconds: 10),
      retryCap: const Duration(milliseconds: 10),
      random: Random(1),
    );

void main() {
  group('reconnect backoff', () {
    test('doubles, caps and stays inside its jitter band', () {
      const base = Duration(seconds: 1);
      const cap = Duration(seconds: 30);
      final rnd = Random(7);
      Duration d(int attempt) => liveRetryDelay(attempt, base: base, cap: cap, random: rnd);

      expect(d(0).inMilliseconds, inInclusiveRange(1000, 1333));
      expect(d(1).inMilliseconds, inInclusiveRange(2000, 2666));
      expect(d(2).inMilliseconds, inInclusiveRange(4000, 5333));
      // Capped, and a huge attempt count neither overflows nor uncaps it.
      expect(d(9).inMilliseconds, inInclusiveRange(30000, 40000));
      expect(d(500).inMilliseconds, inInclusiveRange(30000, 40000));
    });
  });

  test('connect is idempotent - a second call opens no second socket', () {
    final channels = FakeChannels();
    final service = _service(channels)..connect();
    service.connect();
    service.connect();
    expect(channels.count, 1);
    service.dispose();
  });

  test('a dropped socket reconnects and restates subscribe + viewing', () async {
    final channels = FakeChannels();
    final service = _service(channels)..connect();
    service.subscribe({'m1'});
    service.viewing('m1');
    expect(channels.last.ofType('subscribe').single['matchIds'], ['m1']);

    await channels.last.drop();
    await settle(60);

    expect(channels.count, greaterThan(1));
    expect(channels.last.ofType('subscribe').single['matchIds'], ['m1']);
    expect(channels.last.ofType('viewing').single['matchId'], 'm1');
    service.dispose();
  });

  test('viewing is what reports the watched match, and clears on leave', () {
    final channels = FakeChannels();
    final service = _service(channels)..connect();
    service.subscribe({'m1', 'm2'});
    service.viewing('m2');
    service.viewing('m2');
    service.viewing(null);
    expect(channels.last.ofType('viewing').map((f) => f['matchId']), ['m2', '']);
    service.dispose();
  });

  test('a missed pong forces a reconnect on a half-open socket', () async {
    final channels = FakeChannels();
    final service = _service(channels)..connect();
    final first = channels.last;
    await settle(70);
    expect(first.ofType('ping'), isNotEmpty);
    expect(channels.count, greaterThan(1), reason: 'the dead socket should be replaced');
    service.dispose();
  });

  test('a pong keeps the socket and never reaches consumers', () async {
    final channels = FakeChannels();
    final service = _service(channels);
    final seen = <String>[];
    service.frames.listen((f) => seen.add(f['type'] as String));
    service.connect();
    await settle(30);
    channels.last.emit({'type': 'pong'});
    await settle(5);
    expect(seen, isNot(contains('pong')));
    service.dispose();
  });

  test('open and close are surfaced as frames', () async {
    final channels = FakeChannels();
    final service = _service(channels);
    final seen = <String>[];
    service.frames.listen((f) => seen.add(f['type'] as String));
    service.connect();
    await settle();
    await channels.last.drop();
    await settle();
    expect(seen, containsAllInOrder(['live:open', 'live:closed']));
    service.dispose();
  });

  test('a frame arriving after dispose is dropped, not added to a closed stream',
      () async {
    final channels = FakeChannels();
    final service = _service(channels)..connect();
    channels.last.emit({'type': 'scores:changed'});
    service.dispose();
    await settle();
    expect(channels.last.closed, isTrue);
  });

  test('malformed frames are ignored', () async {
    final channels = FakeChannels();
    final service = _service(channels);
    final seen = <Map<String, dynamic>>[];
    service.frames.listen(seen.add);
    service.connect();
    channels.last.emitRaw('not json');
    channels.last.emitRaw('[1,2,3]');
    channels.last.emit({'type': 'scores:changed'});
    await settle();
    expect(seen.map((f) => f['type']), ['live:open', 'scores:changed']);
    service.dispose();
  });

  test('disconnect closes the socket but the service stays usable', () async {
    final channels = FakeChannels();
    final service = _service(channels)..connect();
    service.disconnect();
    expect(channels.last.closed, isTrue);
    expect(service.isConnected, isFalse);
    service.connect();
    expect(channels.count, 2);
    service.dispose();
  });
}
