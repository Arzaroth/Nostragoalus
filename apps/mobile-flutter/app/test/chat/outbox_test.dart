import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/chat/outbox.dart';

// The outbox is the only thing standing between a thrown send and lost typed
// text, so every transition gets a test: the web's equivalent shipped with two
// review-caught bugs in exactly this machine.
void main() {
  test('a successful send leaves nothing behind', () async {
    final outbox = ChatOutbox();
    await outbox.enqueue('league:1', 'hello', () async {});
    expect(outbox.state, isEmpty);
  });

  test('a failed send keeps the text, marked failed', () async {
    final outbox = ChatOutbox();
    await outbox.enqueue('league:1', 'hello', () async => throw StateError('no chat key'));
    expect(outbox.state.single.text, equals('hello'));
    expect(outbox.state.single.failed, isTrue);
    expect(outbox.forRoom('league:1'), hasLength(1));
    expect(outbox.forRoom('league:2'), isEmpty);
  });

  test('a pending entry shows before its send completes', () async {
    final outbox = ChatOutbox();
    final gate = Completer<void>();
    final pending = outbox.enqueue('league:1', 'hello', () => gate.future);
    expect(outbox.state.single.failed, isFalse);
    gate.complete();
    await pending;
    expect(outbox.state, isEmpty);
  });

  test('retry clears the failed flag and removes the entry when it lands', () async {
    final outbox = ChatOutbox();
    var attempts = 0;
    Future<void> send() async {
      attempts++;
      if (attempts == 1) throw StateError('no chat key');
    }

    await outbox.enqueue('league:1', 'hello', send);
    expect(outbox.state.single.failed, isTrue);
    await outbox.retry(outbox.state.single.localId);
    expect(outbox.state, isEmpty);
    expect(attempts, equals(2));
  });

  test('a retry that fails again stays failed', () async {
    final outbox = ChatOutbox();
    await outbox.enqueue('league:1', 'hello', () async => throw StateError('nope'));
    await outbox.retry(outbox.state.single.localId);
    expect(outbox.state.single.failed, isTrue);
  });

  test('discard drops the entry', () async {
    final outbox = ChatOutbox();
    await outbox.enqueue('league:1', 'hello', () async => throw StateError('nope'));
    outbox.discard(outbox.state.single.localId);
    expect(outbox.state, isEmpty);
  });

  test('retrying a discarded id is a no-op, not a resurrection', () async {
    final outbox = ChatOutbox();
    var sends = 0;
    await outbox.enqueue('league:1', 'hello', () async {
      sends++;
      throw StateError('nope');
    });
    final id = outbox.state.single.localId;
    outbox.discard(id);
    await outbox.retry(id);
    expect(outbox.state, isEmpty);
    expect(sends, equals(1));
  });

  test('two overlapping sends keep their own identity and outcome', () async {
    final outbox = ChatOutbox();
    final first = Completer<void>();
    final second = Completer<void>();
    final a = outbox.enqueue('league:1', 'first', () => first.future);
    final b = outbox.enqueue('league:1', 'second', () => second.future);
    expect(outbox.state.map((e) => e.text), equals(['first', 'second']));

    second.complete();
    await b;
    expect(outbox.state.map((e) => e.text), equals(['first']));

    first.completeError(StateError('nope'));
    await a;
    expect(outbox.state.single.text, equals('first'));
    expect(outbox.state.single.failed, isTrue);
  });
}
