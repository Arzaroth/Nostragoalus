import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/api.dart';
import 'package:nostragoalus/api/auth_repository.dart';
import 'package:nostragoalus/api/token_store.dart';
import 'package:nostragoalus/chat/chat_crypto.dart';
import 'package:nostragoalus/chat/chat_providers.dart';
import 'package:nostragoalus/e2ee/e2ee.dart' as e2ee;
import 'package:nostragoalus/state/providers.dart';
import 'package:sodium/sodium_sumo.dart';

import '../api/helpers.dart';
import '../e2ee/sodium_loader.dart';
import 'route_adapter.dart';

class _FakeAuth extends AuthController {
  @override
  Future<AuthUser?> build() async => const AuthUser(id: 'me', email: 'me@example.com');
}

class _SignedOut extends AuthController {
  @override
  Future<AuthUser?> build() async => null;
}

class _StubIdentity extends ChatIdentityController {
  _StubIdentity(this._id);
  final ({String publicKey, SecureKey privateKey}) _id;
  @override
  Future<ChatIdentityState> build() async =>
      ChatIdentityState(identity: ChatIdentity(_id.publicKey, _id.privateKey));
}

class _NoIdentity extends ChatIdentityController {
  @override
  Future<ChatIdentityState> build() async => const ChatIdentityState();
}

void main() {
  late SodiumSumo sodium;
  setUpAll(() async => sodium = await SodiumSumoInit.init(loadLibsodium));

  ({ProviderContainer c, RouteAdapter adapter, ChatKeyStore store}) build(
    Map<String, Reply Function()> routes, {
    ({String publicKey, SecureKey privateKey})? identity,
    bool noIdentity = false,
    bool signedOut = false,
    ChatKeyStore? store,
  }) {
    final adapter = RouteAdapter(routes);
    final api = ApiClient(TokenStore(InMemoryKv()), dio: Dio()..httpClientAdapter = adapter);
    final keyStore = store ?? ChatKeyStore(InMemoryKv());
    final c = ProviderContainer(overrides: [
      sodiumProvider.overrideWith((ref) async => sodium),
      apiProvider.overrideWithValue(api),
      chatKeyStoreProvider.overrideWithValue(keyStore),
      authControllerProvider.overrideWith(signedOut ? _SignedOut.new : _FakeAuth.new),
      if (identity != null) chatIdentityProvider.overrideWith(() => _StubIdentity(identity)),
      if (noIdentity) chatIdentityProvider.overrideWith(_NoIdentity.new),
    ]);
    addTearDown(c.dispose);
    return (c: c, adapter: adapter, store: keyStore);
  }

  Map<String, Object?> status(
    ({String publicKey, SecureKey privateKey}) me, {
    required SecureKey groupKey,
    int epoch = 1,
    bool enabled = true,
    int wrapEpoch = 1,
    bool wrapForMe = true,
  }) =>
      {
        'enabled': enabled,
        'epoch': epoch,
        'role': 'MEMBER',
        'rekeyPending': false,
        'missingKeys': <Map<String, Object?>>[],
        'memberKeys': <Map<String, Object?>>[],
        'myWrappedKeys': wrapForMe
            ? [
                {
                  'epoch': wrapEpoch,
                  'wrappedKey': e2ee.sealGroupKey(sodium, groupKey, me.publicKey),
                }
              ]
            : <Map<String, Object?>>[],
      };

  Map<String, Object?> message(String id, String ciphertext,
          {int epoch = 1, String createdAt = '2026-07-21T10:00:00.000Z'}) =>
      {
        'id': id,
        'leagueId': 'l1',
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

  group('identity bootstrap', () {
    test('signed out yields no identity and touches nothing', () async {
      final b = build(const {}, signedOut: true);
      expect((await b.c.read(chatIdentityProvider.future)).identity, isNull);
      expect(b.adapter.calls, isEmpty);
    });

    test('generates and registers a keypair when the server has none', () async {
      final b = build({
        '/api/chat/identity': () => Reply(200, {'identity': null}),
      });
      final state = await b.c.read(chatIdentityProvider.future);
      expect(state.identity, isNotNull);
      expect(b.adapter.calls, contains('PUT /api/chat/identity'));
      // Persisted for this user, so the next launch reuses it.
      expect(await b.store.load(sodium, 'me'), isNotNull);
    });

    test('REUSES the device key when the server transiently reports none', () async {
      final mine = e2ee.generateIdentity(sodium);
      final store = ChatKeyStore(InMemoryKv());
      await store.save('me', ChatIdentity(mine.publicKey, mine.privateKey));
      final b = build({
        '/api/chat/identity': () => Reply(200, {'identity': null}),
      }, store: store);

      final state = await b.c.read(chatIdentityProvider.future);
      expect(state.identity!.publicKey, mine.publicKey,
          reason: 'regenerating would destroy every key sealed to this device');
    });

    test('reuses the local key when it matches the served public key', () async {
      final mine = e2ee.generateIdentity(sodium);
      final store = ChatKeyStore(InMemoryKv());
      await store.save('me', ChatIdentity(mine.publicKey, mine.privateKey));
      final b = build({
        '/api/chat/identity': () => Reply(200, {
              'identity': {'publicKey': mine.publicKey, 'hasRecovery': true}
            }),
      }, store: store);

      final state = await b.c.read(chatIdentityProvider.future);
      expect(state.identity!.publicKey, mine.publicKey);
      expect(state.needsRecovery, isFalse);
    });

    test('flags recovery when this device holds a different key', () async {
      final stranger = e2ee.generateIdentity(sodium);
      final b = build({
        '/api/chat/identity': () => Reply(200, {
              'identity': {'publicKey': stranger.publicKey, 'hasRecovery': true}
            }),
      });
      final state = await b.c.read(chatIdentityProvider.future);
      expect(state.identity, isNull);
      expect(state.needsRecovery, isTrue);
    });
  });

  group('reset and recovery escrow', () {
    test('reset persists locally BEFORE telling the server', () async {
      final b = build({
        '/api/chat/identity': () => Reply(200, {'identity': null}),
        '/api/chat/identity/reset': () => Reply(200, {'ok': true}),
      });
      await b.c.read(chatIdentityProvider.future);
      await b.c.read(chatIdentityProvider.notifier).reset();

      final calls = b.adapter.calls;
      expect(calls, contains('POST /api/chat/identity/reset'));
      expect((await b.c.read(chatIdentityProvider.future)).identity, isNotNull);
    });

    test('a failed server reset leaves the old server identity intact', () async {
      final b = build({
        '/api/chat/identity': () => Reply(200, {'identity': null}),
        '/api/chat/identity/reset': () => Reply(500, {'error': 'boom'}),
      });
      await b.c.read(chatIdentityProvider.future);
      await b.c.read(chatIdentityProvider.notifier).reset();
      expect(b.c.read(chatIdentityProvider).hasError, isTrue);
    });

    test('createRecoveryCode escrows the key and hands the code back once', () async {
      final mine = e2ee.generateIdentity(sodium);
      final b = build({
        '/api/chat/recovery': () => Reply(200, {'ok': true}),
      }, identity: mine);

      await b.c.read(chatIdentityProvider.future);
      final code = await b.c.read(chatIdentityProvider.notifier).createRecoveryCode();

      expect(code.split('-'), hasLength(4));
      expect(b.adapter.calls, contains('PUT /api/chat/recovery'));
    });

    test('setupRecovery is a no-op without an identity', () async {
      final b = build(const {}, noIdentity: true);
      await b.c.read(chatIdentityProvider.future);
      await b.c.read(chatIdentityProvider.notifier).setupRecovery('CODE');
      expect(b.adapter.calls, isEmpty);
    });
  });

  group('the league room', () {
    test('needsIdentity without one', () async {
      final b = build(const {}, noIdentity: true);
      expect((await b.c.read(leagueChatProvider('l1').future)).state, ChatState.needsIdentity);
    });

    test('disabled when the league has chat off', () async {
      final me = e2ee.generateIdentity(sodium);
      final key = e2ee.generateGroupKey(sodium);
      final b = build({
        '/api/leagues/l1/chat': () => Reply(200, status(me, groupKey: key, enabled: false)),
      }, identity: me);
      expect((await b.c.read(leagueChatProvider('l1').future)).state, ChatState.disabled);
    });

    test('awaitingKey when nothing is wrapped for the current epoch', () async {
      final me = e2ee.generateIdentity(sodium);
      final key = e2ee.generateGroupKey(sodium);
      final b = build({
        '/api/leagues/l1/chat': () =>
            Reply(200, status(me, groupKey: key, epoch: 3, wrapEpoch: 1)),
      }, identity: me);
      expect((await b.c.read(leagueChatProvider('l1').future)).state, ChatState.awaitingKey);
    });

    test('keyMismatch when this device opens none of the wraps', () async {
      final me = e2ee.generateIdentity(sodium);
      final stranger = e2ee.generateIdentity(sodium);
      final key = e2ee.generateGroupKey(sodium);
      final b = build({
        '/api/leagues/l1/chat': () => Reply(200, status(stranger, groupKey: key)),
      }, identity: me);
      expect((await b.c.read(leagueChatProvider('l1').future)).state, ChatState.keyMismatch);
    });

    test('decrypts, and keeps an undecryptable line rather than dropping it', () async {
      final me = e2ee.generateIdentity(sodium);
      final key = e2ee.generateGroupKey(sodium);
      final b = build({
        '/api/leagues/l1/chat': () => Reply(200, status(me, groupKey: key)),
        // The route answers NEWEST first (it pages backwards with `before=`),
        // so this is the newer message on top.
        '/api/leagues/l1/chat/messages': () => Reply(200, {
              'messages': [
                message('m1', e2ee.encryptMessage(sodium, 'hello', key),
                    createdAt: '2026-07-21T10:05:00.000Z'),
                message('m2', 'not-a-ciphertext',
                    createdAt: '2026-07-21T10:00:00.000Z'),
              ]
            }),
      }, identity: me);

      final view = await b.c.read(leagueChatProvider('l1').future);
      expect(view.state, ChatState.ready);
      // Send order, oldest first: the reversed ListView renders item 0 at the
      // bottom, so leaving the wire order here put the newest message at the TOP.
      expect(view.lines.map((l) => l.text), [null, 'hello']);
      expect(view.lines.map((l) => l.id), ['m2', 'm1']);
      expect(view.lines.first.authorName, 'Them');
    });

    test('a thread reads the same keys', () async {
      final me = e2ee.generateIdentity(sodium);
      final key = e2ee.generateGroupKey(sodium);
      final b = build({
        '/api/leagues/l1/chat': () => Reply(200, status(me, groupKey: key)),
        '/api/leagues/l1/chat/messages': () => Reply(200, {
              'messages': [message('m1', e2ee.encryptMessage(sodium, 'in thread', key))]
            }),
      }, identity: me);

      final lines = await b.c.read(leagueThreadProvider(('l1', 'root')).future);
      expect(lines.single.text, 'in thread');
    });

    // The same route, the opposite wire order: thread mode reverses server-side
    // and answers oldest first. Reversing here too would cancel that out, and a
    // single-message fixture cannot tell the two apart - which is how threads
    // came out backwards the first time.
    test('a thread keeps the order the server sent, which is oldest first', () async {
      final me = e2ee.generateIdentity(sodium);
      final key = e2ee.generateGroupKey(sodium);
      final b = build({
        '/api/leagues/l1/chat': () => Reply(200, status(me, groupKey: key)),
        '/api/leagues/l1/chat/messages': () => Reply(200, {
              'messages': [
                message('m1', e2ee.encryptMessage(sodium, 'first', key),
                    createdAt: '2026-07-21T10:00:00.000Z'),
                message('m2', e2ee.encryptMessage(sodium, 'second', key),
                    createdAt: '2026-07-21T10:05:00.000Z'),
              ]
            }),
      }, identity: me);

      final lines = await b.c.read(leagueThreadProvider(('l1', 'root')).future);
      expect(lines.map((l) => l.id), ['m1', 'm2']);
      expect(lines.map((l) => l.text), ['first', 'second']);
    });

    test('a thread is empty without an identity', () async {
      final b = build(const {}, noIdentity: true);
      expect(await b.c.read(leagueThreadProvider(('l1', 'root')).future), isEmpty);
    });
  });

  group('the call log', () {
    Map<String, Object?> callRow(String id) => {
          'id': id,
          'status': 'ENDED',
          'initiatorId': 'u1',
          'initiatorName': 'Ana',
          'participantCount': 2,
          'startedAt': '2026-07-21T10:00:00.000Z',
          'endedAt': '2026-07-21T10:01:00.000Z',
        };

    test('reads a league room scoped by league id', () async {
      final b = build({
        '/api/voice/calls': () => Reply(200, {
              'calls': [callRow('c1')]
            }),
      });
      final calls =
          await b.c.read(callLogProvider((leagueId: 'l1', threadId: null)).future);
      expect(calls.single.id, 'c1');
      expect(b.adapter.queries['/api/voice/calls'], {'leagueId': 'l1'});
    });

    test('reads a DM scoped by thread id', () async {
      final b = build({
        '/api/voice/calls': () => Reply(200, {'calls': []}),
      });
      await b.c.read(callLogProvider((leagueId: null, threadId: 't1')).future);
      expect(b.adapter.queries['/api/voice/calls'], {'dmThreadId': 't1'});
    });

    // The strip is decoration. A room the server will not answer for still has
    // to open and show its messages.
    test('a refused read renders no lines rather than failing the room', () async {
      final b = build({
        '/api/voice/calls': () => Reply(404, {'error': 'not a member'}),
      });
      expect(await b.c.read(callLogProvider((leagueId: 'l1', threadId: null)).future),
          isEmpty);
    });

    test('a payload that does not match the contract degrades the same way', () async {
      final b = build({
        '/api/voice/calls': () => Reply(200, {
              'calls': [
                {'id': 'c1'}
              ]
            }),
      });
      expect(await b.c.read(callLogProvider((leagueId: 'l1', threadId: null)).future),
          isEmpty);
    });
  });

  group('sending and editing', () {
    test('send throws without a key, so the outbox keeps the message', () async {
      final me = e2ee.generateIdentity(sodium);
      final b = build({
        '/api/leagues/l1/chat': () => Reply(500, {'error': 'boom'}),
      }, identity: me);
      await expectLater(b.c.read(sendChatProvider)('l1', 'hi'), throwsA(isA<StateError>()));
    });

    test('send encrypts text, mentions and an image, into a thread', () async {
      final me = e2ee.generateIdentity(sodium);
      final key = e2ee.generateGroupKey(sodium);
      final b = build({
        '/api/leagues/l1/chat': () => Reply(200, status(me, groupKey: key)),
        '/api/leagues/l1/chat/messages': () => Reply(200, {'messages': []}),
      }, identity: me);

      await b.c.read(leagueChatProvider('l1').future);
      await b.c.read(sendChatProvider)('l1', 'hi',
          mentions: const ['u2'],
          image: Uint8List.fromList(const [1, 2, 3]),
          threadId: 'root');

      expect(b.adapter.calls, contains('POST /api/leagues/l1/chat/messages'));
    });

    test('edit throws without a key and re-encrypts with one', () async {
      final me = e2ee.generateIdentity(sodium);
      final key = e2ee.generateGroupKey(sodium);
      final noKey = build({
        '/api/leagues/l1/chat': () => Reply(500, {'error': 'boom'}),
      }, identity: me);
      await expectLater(
          noKey.c.read(editChatProvider)('l1', 'm1', 'x'), throwsA(isA<StateError>()));

      final b = build({
        '/api/leagues/l1/chat': () => Reply(200, status(me, groupKey: key)),
        '/api/leagues/l1/chat/messages': () => Reply(200, {'messages': []}),
        '/api/leagues/l1/chat/edit': () => Reply(200, {'ok': true}),
      }, identity: me);
      await b.c.read(leagueChatProvider('l1').future);
      await b.c.read(editChatProvider)('l1', 'm1', 'fixed');
      expect(b.adapter.calls, contains('POST /api/leagues/l1/chat/edit'));
    });
  });

  group('attachments and moderation', () {
    test('attachment decrypts, and degrades to null rather than throwing', () async {
      final me = e2ee.generateIdentity(sodium);
      final key = e2ee.generateGroupKey(sodium);
      final bytes = Uint8List.fromList(List.generate(16, (i) => i));

      final ok = build({
        '/api/leagues/l1/chat': () => Reply(200, status(me, groupKey: key)),
        '/api/leagues/l1/chat/attachments/m1': () => Reply(200, {
              'epoch': 1,
              'ciphertext': e2ee.encryptBytes(sodium, bytes, key),
            }),
      }, identity: me);
      expect(await ok.c.read(chatAttachmentProvider(('l1', 'm1', 0)).future), bytes);

      final corrupt = build({
        '/api/leagues/l1/chat': () => Reply(200, status(me, groupKey: key)),
        '/api/leagues/l1/chat/attachments/m1': () =>
            Reply(200, {'epoch': 1, 'ciphertext': 'rubbish'}),
      }, identity: me);
      expect(await corrupt.c.read(chatAttachmentProvider(('l1', 'm1', 0)).future), isNull);

      final wrongEpoch = build({
        '/api/leagues/l1/chat': () => Reply(200, status(me, groupKey: key)),
        '/api/leagues/l1/chat/attachments/m1': () =>
            Reply(200, {'epoch': 77, 'ciphertext': 'x'}),
      }, identity: me);
      expect(await wrongEpoch.c.read(chatAttachmentProvider(('l1', 'm1', 0)).future), isNull);

      final none = build(const {}, noIdentity: true);
      expect(await none.c.read(chatAttachmentProvider(('l1', 'm1', 0)).future), isNull);
    });

    test('reports decrypt for the moderator and stay attributed', () async {
      final me = e2ee.generateIdentity(sodium);
      final key = e2ee.generateGroupKey(sodium);
      final b = build({
        '/api/leagues/l1/chat': () => Reply(200, status(me, groupKey: key)),
        '/api/leagues/l1/chat/reports': () => Reply(200, {
              'reports': [
                {
                  'id': 'm1',
                  'userId': 'them',
                  'authorName': 'Them',
                  'authorImage': null,
                  'epoch': 1,
                  'ciphertext': e2ee.encryptMessage(sodium, 'rude', key),
                  'moderation': 'PENDING',
                  'reports': 2,
                  'createdAt': '2026-07-21T10:00:00.000Z',
                },
                {
                  'id': 'm2',
                  'userId': 'them',
                  'authorName': 'Them',
                  'authorImage': null,
                  'epoch': 99,
                  'ciphertext': 'unopenable',
                  'moderation': 'PENDING',
                  'reports': 1,
                  'createdAt': '2026-07-21T10:00:00.000Z',
                },
              ]
            }),
      }, identity: me);

      final out = await b.c.read(moderationReportsProvider('l1').future);
      expect(out.map((r) => r.text), ['rude', null]);
      expect(out.first.authorName, 'Them',
          reason: 'a ruling must not be made against a bare user id');
      expect(out.first.reports, 2);
    });

    test('reports are empty without an identity', () async {
      final b = build(const {}, noIdentity: true);
      expect(await b.c.read(moderationReportsProvider('l1').future), isEmpty);
    });

    test('the epoch keys throw without an identity', () async {
      final b = build(const {}, noIdentity: true);
      await expectLater(
          b.c.read(leagueEpochKeysProvider('l1').future), throwsA(isA<StateError>()));
    });
  });
}
