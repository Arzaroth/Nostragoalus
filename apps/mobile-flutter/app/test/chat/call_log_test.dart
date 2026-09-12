import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/models.gen.dart';
import 'package:nostragoalus/chat/call_log.dart';

Call call(
  String id, {
  required String startedAt,
  String? endedAt,
  CallStatusValue status = CallStatusValue.ended,
  String? name = 'Ana',
}) =>
    Call(
      id: id,
      status: status,
      initiatorId: 'u1',
      initiatorName: name,
      participantCount: 2,
      startedAt: startedAt,
      endedAt: endedAt,
    );

({String id, String createdAt}) msg(String id, String createdAt) =>
    (id: id, createdAt: createdAt);

void main() {
  group('callDuration', () {
    test('measures a finished call', () {
      expect(
        callDuration(call('c', startedAt: '2026-07-21T10:00:00Z', endedAt: '2026-07-21T10:02:30Z')),
        '2:30',
      );
    });

    // Still running, so there is no duration to state.
    test('is null while the call is ongoing', () {
      expect(callDuration(call('c', startedAt: '2026-07-21T10:00:00Z')), isNull);
    });

    test('is null when a timestamp does not parse', () {
      expect(callDuration(call('c', startedAt: 'nonsense', endedAt: 'also nonsense')), isNull);
    });
  });

  group('callLineText', () {
    test('picks the line for each status', () {
      expect(
        callLineText(call('c', startedAt: 'x', status: CallStatusValue.missed), '?')?.$1,
        'voice.log.missed',
      );
      expect(
        callLineText(call('c', startedAt: 'x', status: CallStatusValue.ongoing), '?')?.$1,
        'voice.log.ongoing',
      );
      final ended = callLineText(
        call('c', startedAt: '2026-07-21T10:00:00Z', endedAt: '2026-07-21T10:01:00Z'),
        '?',
      );
      expect(ended?.$1, 'voice.log.ended');
      expect(ended?.$2, {'name': 'Ana', 'duration': '1:00'});
    });

    // The account was deleted; the caller supplies the localized fallback.
    test('falls back when the initiator has no name', () {
      expect(
        callLineText(call('c', startedAt: 'x', status: CallStatusValue.ongoing, name: null),
            'Someone')?.$2['name'],
        'Someone',
      );
    });

    // A status this build does not know must not become an invented sentence.
    test('renders nothing for an unknown status', () {
      expect(
        callLineText(call('c', startedAt: 'x', status: CallStatusValue.unknown), '?'),
        isNull,
      );
    });
  });

  group('anchorCalls', () {
    final messages = [
      msg('m1', '2026-07-21T10:00:00Z'),
      msg('m2', '2026-07-21T12:00:00Z'),
    ];

    test('anchors each call before the first message newer than it', () {
      final a = anchorCalls([call('c1', startedAt: '2026-07-21T11:00:00Z')], messages);
      expect(a.before.keys, ['m2']);
      expect(a.before['m2']!.single.id, 'c1');
      expect(a.tail, isEmpty);
    });

    test('a call newer than every message trails the list', () {
      final a = anchorCalls([call('c1', startedAt: '2026-07-21T13:00:00Z')], messages);
      expect(a.before, isEmpty);
      expect(a.tail.single.id, 'c1');
    });

    test('several calls in the same gap keep their order', () {
      final a = anchorCalls([
        call('c1', startedAt: '2026-07-21T10:30:00Z'),
        call('c2', startedAt: '2026-07-21T11:30:00Z'),
      ], messages);
      expect(a.before['m2']!.map((c) => c.id), ['c1', 'c2']);
    });

    // A call at exactly a message's timestamp belongs after it, not before: the
    // message is what was already there when the call started.
    test('a call at the same instant as a message follows it', () {
      final a = anchorCalls([call('c1', startedAt: '2026-07-21T10:00:00Z')], messages);
      expect(a.before['m2']!.single.id, 'c1');
    });

    test('with no messages at all, every call trails', () {
      final a = anchorCalls([call('c1', startedAt: '2026-07-21T10:00:00Z')], const []);
      expect(a.tail.single.id, 'c1');
    });

    // Comparing raw ISO strings would mis-anchor these two: '...T10:00:00Z' and
    // '...T10:00:00.000Z' are the same instant but not the same text.
    test('compares instants, not the strings they were written as', () {
      final a = anchorCalls(
        [call('c1', startedAt: '2026-07-21T11:00:00.000Z')],
        [msg('m1', '2026-07-21T11:00:00Z'), msg('m2', '2026-07-21T12:00:00Z')],
      );
      expect(a.before['m2']!.single.id, 'c1');
    });

    test('walks past a message whose timestamp does not parse', () {
      final a = anchorCalls([call('c1', startedAt: '2026-07-21T11:00:00Z')], [
        msg('m1', '2026-07-21T10:00:00Z'),
        msg('m2', 'nonsense'),
        msg('m3', '2026-07-21T12:00:00Z'),
      ]);
      expect(a.before.keys, ['m3']);
      expect(a.tail, isEmpty);
    });

    test('skips a call whose start time does not parse', () {
      final a = anchorCalls([call('c1', startedAt: 'nonsense')], messages);
      expect(a.before, isEmpty);
      expect(a.tail, isEmpty);
    });
  });
}
