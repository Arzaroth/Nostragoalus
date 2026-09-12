import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/api.dart';
import 'package:nostragoalus/api/auth_repository.dart';
import 'package:nostragoalus/api/token_store.dart';
import 'package:nostragoalus/chat/chat_crypto.dart';
import 'package:nostragoalus/chat/chat_providers.dart';
import 'package:nostragoalus/chat/dm_providers.dart';
import 'package:nostragoalus/e2ee/e2ee.dart' as e2ee;
import 'package:nostragoalus/kt/key_transparency.dart';
import 'package:nostragoalus/kt/kt_providers.dart';
import 'package:nostragoalus/state/providers.dart';
import 'package:sodium/sodium_sumo.dart';

import '../api/helpers.dart';
import '../e2ee/sodium_loader.dart';
import 'route_adapter.dart';

class _FakeAuth extends AuthController {
  @override
  Future<AuthUser?> build() async => const AuthUser(id: 'me', email: 'me@example.com');
}

/// A KT view whose verdict the test dictates, so the DM paths can be driven
/// without hand-building a hash chain.
KtView _kt({
  List<dynamic> entries = const [],
  bool chainOk = true,
  bool headTampered = false,
}) =>
    KtView(
      verification: const KtVerification(ok: true, count: 0, head: 'h'),
      entryCount: entries.length,
      headHash: 'h',
      chainOk: chainOk,
      headTampered: headTampered,
      entries: entries,
    );

void main() {
  late SodiumSumo sodium;
  setUpAll(() async => sodium = await SodiumSumoInit.init(loadLibsodium));

  ({ProviderContainer c, RouteAdapter adapter}) build(
    Map<String, Reply Function()> routes, {
    ({String publicKey, SecureKey privateKey})? identity,
    bool noIdentity = false,
    KtView? kt,
    Object? ktError,
  }) {
    final adapter = RouteAdapter(routes);
    final api = ApiClient(TokenStore(InMemoryKv()), dio: Dio()..httpClientAdapter = adapter);
    final store = ChatKeyStore(InMemoryKv());
    final c = ProviderContainer(overrides: [
      sodiumProvider.overrideWith((ref) async => sodium),
      apiProvider.overrideWithValue(api),
      chatKeyStoreProvider.overrideWithValue(store),
      authControllerProvider.overrideWith(_FakeAuth.new),
      if (identity != null)
        chatIdentityProvider.overrideWith(() => _StubIdentity(identity)),
      // The real controller GENERATES a keypair when the server has none, so a
      // null server identity is not the signed-out case this asserts.
      if (noIdentity) chatIdentityProvider.overrideWith(_NoIdentity.new),
      if (kt != null) ktProvider.overrideWith((ref) async => kt),
      if (ktError != null) ktProvider.overrideWith((ref) async => throw ktError),
    ]);
    addTearDown(c.dispose);
    return (c: c, adapter: adapter);
  }

  Map<String, Object?> thread(
    String id,
    ({String publicKey, SecureKey privateKey}) me, {
    required SecureKey groupKey,
    int epoch = 1,
    String otherKey = 'other-pub',
    String? otherReadAt,
    bool wrapForMe = true,
  }) =>
      {
        'thread': {
          'threadId': id,
          'epoch': epoch,
          'otherMissingCurrentKey': false,
          'other': {'userId': 'them', 'name': 'Them', 'publicKey': otherKey},
          'otherLastReadAt': otherReadAt,
          'myWrappedKeys': wrapForMe
              ? [
                  {
                    'epoch': epoch,
                    'wrappedKey': e2ee.sealGroupKey(sodium, groupKey, me.publicKey),
                  }
                ]
              : <Map<String, Object?>>[],
        }
      };

  Map<String, Object?> message(String id, String ciphertext,
          {int epoch = 1, String createdAt = '2026-07-21T10:00:00.000Z'}) =>
      {
        'id': id,
        'leagueId': '',
        'userId': 'them',
        'ciphertext': ciphertext,
        'epoch': epoch,
        'createdAt': createdAt,
        'authorName': 'Them',
        'authorImage': null,
        'moderation': 'VISIBLE',
        'reported': false,
        'reactions': {'FIRE': 0, 'GOAL': 0, 'WOW': 0, 'LAUGH': 0, 'SAD': 0, 'ANGRY': 0},
        'myReaction': null,
        'threadCount': 0,
        'attachments': <Map<String, Object?>>[],
      };

  group('the thread list', () {
    test('threads and recipients read their endpoints', () async {
      final b = build({
        '/api/dm/threads': () => Reply(200, {'threads': []}),
        '/api/dm/recipients': () => Reply(200, {'recipients': []}),
      });
      expect((await b.c.read(dmThreadsProvider.future)).threads, isEmpty);
      expect((await b.c.read(dmRecipientsProvider.future)).recipients, isEmpty);
    });
  });

  group('the room', () {
    test('reports needsIdentity when this device has no chat identity', () async {
      final b = build(const {}, noIdentity: true);
      final view = await b.c.read(dmRoomProvider('t1').future);
      expect(view.state, ChatState.needsIdentity);
    });

    test('decrypts the thread, keeps the peer and the read receipt', () async {
      final me = e2ee.generateIdentity(sodium);
      final key = e2ee.generateGroupKey(sodium);
      final b = build(
        {
          '/api/dm/t1': () => Reply(200, thread('t1', me,
              groupKey: key, otherReadAt: '2026-07-21T11:00:00.000Z')),
          '/api/dm/t1/messages': () => Reply(200, {
                'messages': [message('m1', e2ee.encryptMessage(sodium, 'hey', key))]
              }),
        },
        identity: me,
        kt: _kt(entries: [
          {'userId': 'them', 'publicKey': 'other-pub'}
        ]),
      );

      final view = await b.c.read(dmRoomProvider('t1').future);
      expect(view.state, ChatState.ready);
      expect(view.lines.single.text, 'hey');
      expect(view.otherName, 'Them');
      expect(view.otherId, 'them');
      expect(view.otherKeyCheck, KtCheck.ok);
      expect(view.otherReadAt, DateTime.parse('2026-07-21T11:00:00.000Z'));
    });

    test('flags a peer key the transparency log contradicts', () async {
      final me = e2ee.generateIdentity(sodium);
      final key = e2ee.generateGroupKey(sodium);
      final b = build(
        {
          '/api/dm/t1': () => Reply(200, thread('t1', me, groupKey: key)),
          '/api/dm/t1/messages': () => Reply(200, {'messages': []}),
        },
        identity: me,
        kt: _kt(entries: [
          {'userId': 'them', 'publicKey': 'a-different-key'}
        ]),
      );
      expect((await b.c.read(dmRoomProvider('t1').future)).otherKeyCheck, KtCheck.mismatch);
    });

    test('an unreachable transparency log does not block the room', () async {
      final me = e2ee.generateIdentity(sodium);
      final key = e2ee.generateGroupKey(sodium);
      final b = build(
        {
          '/api/dm/t1': () => Reply(200, thread('t1', me, groupKey: key)),
          '/api/dm/t1/messages': () => Reply(200, {'messages': []}),
        },
        identity: me,
        ktError: StateError('kt down'),
      );
      final view = await b.c.read(dmRoomProvider('t1').future);
      expect(view.state, ChatState.ready);
      expect(view.otherKeyCheck, KtCheck.unknown);
    });

    test('awaits a key when nothing is wrapped for this epoch', () async {
      final me = e2ee.generateIdentity(sodium);
      final key = e2ee.generateGroupKey(sodium);
      final b = build(
        {
          // Wrapped for epoch 1, but the thread has moved on to epoch 2.
          '/api/dm/t1': () => Reply(200, {
                'thread': {
                  'threadId': 't1',
                  'epoch': 2,
                  'otherMissingCurrentKey': false,
                  'other': {'userId': 'them', 'name': 'Them', 'publicKey': 'other-pub'},
                  'otherLastReadAt': null,
                  'myWrappedKeys': [
                    {
                      'epoch': 1,
                      'wrappedKey': e2ee.sealGroupKey(sodium, key, me.publicKey),
                    }
                  ],
                }
              }),
        },
        identity: me,
        kt: _kt(),
      );
      final view = await b.c.read(dmRoomProvider('t1').future);
      expect(view.state, ChatState.awaitingKey);
      expect(view.epoch, 2);
    });

    test('a device key that opens none of the wraps reads as keyMismatch', () async {
      final me = e2ee.generateIdentity(sodium);
      final stranger = e2ee.generateIdentity(sodium);
      final key = e2ee.generateGroupKey(sodium);
      final b = build(
        {
          // Sealed to somebody else's public key entirely.
          '/api/dm/t1': () => Reply(200, thread('t1', stranger, groupKey: key)),
        },
        identity: me,
        kt: _kt(),
      );
      final view = await b.c.read(dmRoomProvider('t1').future);
      expect(view.state, ChatState.keyMismatch,
          reason: 'a blank room would look like "no messages yet"');
    });

    test('an undecryptable message still lists, with no text', () async {
      final me = e2ee.generateIdentity(sodium);
      final key = e2ee.generateGroupKey(sodium);
      final b = build(
        {
          '/api/dm/t1': () => Reply(200, thread('t1', me, groupKey: key)),
          '/api/dm/t1/messages': () => Reply(200, {
                'messages': [
                  message('m1', 'not-a-ciphertext'),
                  message('m2', e2ee.encryptMessage(sodium, 'fine', key), epoch: 9),
                ]
              }),
        },
        identity: me,
        kt: _kt(),
      );
      final lines = (await b.c.read(dmRoomProvider('t1').future)).lines;
      expect(lines, hasLength(2));
      expect(lines[0].text, isNull, reason: 'corrupt ciphertext');
      expect(lines[1].text, isNull, reason: 'no key for that epoch');
    });

    // The route answers newest first. Fixtures here carry the wire order, so a
    // test that stopped reversing would have to claim a DM reads backwards.
    test('reads oldest first, whatever order the wire used', () async {
      final me = e2ee.generateIdentity(sodium);
      final key = e2ee.generateGroupKey(sodium);
      final b = build(
        {
          '/api/dm/t1': () => Reply(200, thread('t1', me, groupKey: key)),
          '/api/dm/t1/messages': () => Reply(200, {
                'messages': [
                  message('m2', e2ee.encryptMessage(sodium, 'second', key),
                      createdAt: '2026-07-21T10:05:00.000Z'),
                  message('m1', e2ee.encryptMessage(sodium, 'first', key),
                      createdAt: '2026-07-21T10:00:00.000Z'),
                ]
              }),
        },
        identity: me,
        kt: _kt(),
      );
      final lines = (await b.c.read(dmRoomProvider('t1').future)).lines;
      expect(lines.map((l) => l.id), ['m1', 'm2']);
      expect(lines.map((l) => l.text), ['first', 'second']);
    });
  });

  group('starting a DM', () {
    Map<String, Reply Function()> createRoutes(String peerKey) => {
          '/api/dm/identity': () => Reply(200, {
                'identity': {'userId': 'them', 'name': 'Them', 'publicKey': peerKey}
              }),
          '/api/dm/threads': () =>
              Reply(200, {'threadId': 't9', 'epoch': 1, 'created': true}),
        };

    test('seals the key to both sides and returns the thread id', () async {
      final me = e2ee.generateIdentity(sodium);
      final peer = e2ee.generateIdentity(sodium);
      final b = build(createRoutes(peer.publicKey),
          identity: me,
          kt: _kt(entries: [
            {'userId': 'them', 'publicKey': peer.publicKey}
          ]));

      await b.c.read(authControllerProvider.future);
      expect(await b.c.read(createDmProvider)('them'), 't9');
    });

    test('refuses a recipient whose key the log contradicts', () async {
      final me = e2ee.generateIdentity(sodium);
      final peer = e2ee.generateIdentity(sodium);
      final b = build(createRoutes(peer.publicKey),
          identity: me,
          kt: _kt(entries: [
            {'userId': 'them', 'publicKey': 'substituted'}
          ]));

      await b.c.read(authControllerProvider.future);
      await expectLater(b.c.read(createDmProvider)('them'), throwsA(isA<KtKeyMismatch>()));
      expect(b.adapter.calls, isNot(contains('POST /api/dm/threads')));
    });

    test('refuses everyone while the log is proven rewritten', () async {
      final me = e2ee.generateIdentity(sodium);
      final peer = e2ee.generateIdentity(sodium);
      final b = build(createRoutes(peer.publicKey),
          identity: me, kt: _kt(headTampered: true));

      await b.c.read(authControllerProvider.future);
      await expectLater(b.c.read(createDmProvider)('them'), throwsA(isA<KtKeyMismatch>()));
    });

    test('an unreachable log stays permissive so an outage cannot block chat', () async {
      final me = e2ee.generateIdentity(sodium);
      final peer = e2ee.generateIdentity(sodium);
      final b = build(createRoutes(peer.publicKey),
          identity: me, ktError: StateError('kt down'));

      await b.c.read(authControllerProvider.future);
      expect(await b.c.read(createDmProvider)('them'), 't9');
    });
  });

  group('sending', () {
    test('throws when there is no key, so the outbox keeps the message', () async {
      final me = e2ee.generateIdentity(sodium);
      final b = build({
        '/api/dm/t1': () => Reply(500, {'error': 'boom'}),
      }, identity: me, kt: _kt());

      await expectLater(b.c.read(sendDmProvider)('t1', 'hello'), throwsA(isA<StateError>()));
    });

    test('encrypts the text, and an image when one is attached', () async {
      final me = e2ee.generateIdentity(sodium);
      final key = e2ee.generateGroupKey(sodium);
      final b = build({
        '/api/dm/t1': () => Reply(200, thread('t1', me, groupKey: key)),
        '/api/dm/t1/messages': () => Reply(200, {'messages': []}),
      }, identity: me, kt: _kt());

      await b.c.read(dmRoomProvider('t1').future);
      await b.c.read(sendDmProvider)('t1', 'hello',
          image: Uint8List.fromList(List.filled(8, 7)));

      expect(b.adapter.calls, contains('POST /api/dm/t1/messages'));
    });
  });

  group('attachments', () {
    test('returns null without an identity', () async {
      final b = build(const {}, noIdentity: true);
      expect(await b.c.read(dmAttachmentProvider(('t1', 'm1', 0)).future), isNull);
    });

    test('decrypts the attachment bytes', () async {
      final me = e2ee.generateIdentity(sodium);
      final key = e2ee.generateGroupKey(sodium);
      final bytes = Uint8List.fromList(List.generate(32, (i) => i));
      final b = build({
        '/api/dm/t1': () => Reply(200, thread('t1', me, groupKey: key)),
        '/api/dm/t1/attachments/m1': () => Reply(200, {
              'epoch': 1,
              'ciphertext': e2ee.encryptBytes(sodium, bytes, key),
            }),
      }, identity: me);

      expect(await b.c.read(dmAttachmentProvider(('t1', 'm1', 0)).future), bytes);
    });

    test('returns null for an epoch this device cannot open', () async {
      final me = e2ee.generateIdentity(sodium);
      final key = e2ee.generateGroupKey(sodium);
      final b = build({
        '/api/dm/t1': () => Reply(200, thread('t1', me, groupKey: key)),
        '/api/dm/t1/attachments/m1': () => Reply(200, {'epoch': 42, 'ciphertext': 'x'}),
      }, identity: me);

      expect(await b.c.read(dmAttachmentProvider(('t1', 'm1', 0)).future), isNull);
    });

    test('returns null on a corrupt attachment rather than throwing', () async {
      final me = e2ee.generateIdentity(sodium);
      final key = e2ee.generateGroupKey(sodium);
      final b = build({
        '/api/dm/t1': () => Reply(200, thread('t1', me, groupKey: key)),
        '/api/dm/t1/attachments/m1': () =>
            Reply(200, {'epoch': 1, 'ciphertext': 'not-a-ciphertext'}),
      }, identity: me);

      expect(await b.c.read(dmAttachmentProvider(('t1', 'm1', 0)).future), isNull);
    });
  });

  group('the epoch keys', () {
    test('throw without an identity', () async {
      final b = build(const {}, noIdentity: true);
      await expectLater(
          b.c.read(dmEpochKeysProvider('t1').future), throwsA(isA<StateError>()));
    });
  });
}

/// A chat identity that is simply present, so the DM paths under test do not
/// re-drive the bootstrap/registration flow.
class _StubIdentity extends ChatIdentityController {
  _StubIdentity(this._id);
  final ({String publicKey, SecureKey privateKey}) _id;

  @override
  Future<ChatIdentityState> build() async =>
      ChatIdentityState(identity: ChatIdentity(_id.publicKey, _id.privateKey));
}

/// Signed-out: no identity at all, which the real controller only reaches when
/// there is no user (otherwise it bootstraps one).
class _NoIdentity extends ChatIdentityController {
  @override
  Future<ChatIdentityState> build() async => const ChatIdentityState();
}
