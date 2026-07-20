import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/api_client.dart';
import 'package:nostragoalus/api/auth_repository.dart';
import 'package:nostragoalus/api/models.gen.dart';
import 'package:nostragoalus/api/nostragoalus_api.dart';
import 'package:nostragoalus/api/token_store.dart';
import 'package:nostragoalus/chat/chat_crypto.dart';
import 'package:nostragoalus/chat/chat_providers.dart';
import 'package:nostragoalus/e2ee/e2ee.dart' as e2ee;
import 'package:nostragoalus/state/providers.dart';
import 'package:sodium/sodium_sumo.dart';

import '../api/helpers.dart';
import 'route_adapter.dart';
import '../e2ee/sodium_loader.dart';

class _FakeAuth extends AuthController {
  @override
  Future<AuthUser?> build() async => const AuthUser(id: 'u1', email: 'u1@example.com');
}

void main() {
  late SodiumSumo sodium;
  setUpAll(() async => sodium = await SodiumSumoInit.init(loadLibsodium));

  ProviderContainer container(RouteAdapter adapter, ChatKeyStore store) {
    final dio = Dio()..httpClientAdapter = adapter;
    final api = NostragoalusApi(ApiClient(TokenStore(InMemoryKv()), dio: dio));
    final c = ProviderContainer(overrides: [
      sodiumProvider.overrideWith((ref) async => sodium),
      apiProvider.overrideWithValue(api),
      chatKeyStoreProvider.overrideWithValue(store),
      authControllerProvider.overrideWith(_FakeAuth.new),
    ]);
    addTearDown(c.dispose);
    return c;
  }

  group('recover()', () {
    test('refuses a private key that does not pair with the served public key', () async {
      final mine = e2ee.generateIdentity(sodium);
      final stranger = e2ee.generateIdentity(sodium);
      // The escrow decrypts fine but holds a DIFFERENT private key (an identity
      // reset elsewhere): pairing it with the served public key would leave the
      // chat permanently, silently blank.
      final blob = e2ee.wrapPrivateKeyWithRecovery(sodium, stranger.privateKey, 'CODE-1234');
      final c = container(
        RouteAdapter({
          '/api/chat/identity': () => Reply(200, {'identity': {'publicKey': mine.publicKey, 'hasRecovery': true}}),
          '/api/chat/recovery': () => Reply(200, {'blob': blob}),
        }),
        ChatKeyStore(InMemoryKv()),
      );
      await c.read(chatIdentityProvider.future);
      expect(() => c.read(chatIdentityProvider.notifier).recover('CODE-1234'),
          throwsA(isA<ChatKeyMismatch>()));
    });

    test('accepts the matching pair and persists it for this user', () async {
      final mine = e2ee.generateIdentity(sodium);
      final blob = e2ee.wrapPrivateKeyWithRecovery(sodium, mine.privateKey, 'CODE-1234');
      final store = ChatKeyStore(InMemoryKv());
      final c = container(
        RouteAdapter({
          '/api/chat/identity': () => Reply(200, {'identity': {'publicKey': mine.publicKey, 'hasRecovery': true}}),
          '/api/chat/recovery': () => Reply(200, {'blob': blob}),
        }),
        store,
      );
      await c.read(chatIdentityProvider.future);
      await c.read(chatIdentityProvider.notifier).recover('CODE-1234');
      final saved = await store.load(sodium, 'u1');
      expect(saved!.publicKey, equals(mine.publicKey));
      expect(e2ee.keyPairMatches(sodium, saved.publicKey, saved.privateKey), isTrue);
    });
  });

  test('reset() persists the new key locally BEFORE telling the server', () async {
    final store = ChatKeyStore(InMemoryKv());
    final adapter = RouteAdapter({
      '/api/chat/identity': () => Reply(200, {'identity': {'publicKey': 'old-key', 'hasRecovery': true}}),
      '/api/chat/identity/reset': () => Reply(500, {'error': 'boom'}),
    });
    final c = container(adapter, store);
    await c.read(chatIdentityProvider.future);

    await c.read(chatIdentityProvider.notifier).reset();
    expect(c.read(chatIdentityProvider).hasError, isTrue);
    // The server call failed, yet the key it would have registered is on disk:
    // the reverse order can leave the server holding a key whose private half
    // never existed, with the old escrow already dropped.
    final saved = await store.load(sodium, 'u1');
    expect(saved, isNotNull);
    expect(adapter.calls, contains('POST /api/chat/identity/reset'));
  });

  test('bootstrap reuses the device key when the server reports no identity', () async {
    final existing = e2ee.generateIdentity(sodium);
    final store = ChatKeyStore(InMemoryKv());
    await store.save('u1', ChatIdentity(existing.publicKey, existing.privateKey));
    final c = container(
      RouteAdapter({'/api/chat/identity': () => Reply(200, {'identity': null})}),
      store,
    );
    final state = await c.read(chatIdentityProvider.future);
    expect(state.identity!.publicKey, equals(existing.publicKey));
  });

  test('sending with no group key throws so the outbox can keep the text', () async {
    final c = container(
      RouteAdapter({'/api/chat/identity': () => Reply(200, {'identity': null})}),
      ChatKeyStore(InMemoryKv()),
    );
    expect(() => c.read(sendChatProvider)('l1', 'hello'), throwsA(isA<StateError>()));
    expect(() => c.read(editChatProvider)('l1', 'm1', 'hello'), throwsA(isA<StateError>()));
  });

  group('openEpochKeys', () {
    ChatIdentity identity() {
      final gen = e2ee.generateIdentity(sodium);
      return ChatIdentity(gen.publicKey, gen.privateKey);
    }

    test('opens the epochs sealed to me and skips the ones that are not', () {
      final me = identity();
      final gk = e2ee.generateGroupKey(sodium);
      final keys = openEpochKeys(sodium, me, [
        MyWrappedKey(epoch: 0, wrappedKey: e2ee.sealGroupKey(sodium, gk, identity().publicKey)),
        MyWrappedKey(epoch: 1, wrappedKey: e2ee.sealGroupKey(sodium, gk, me.publicKey)),
      ]);
      expect(keys.keys, equals([1]));
      expect(keys[1]!.extractBytes(), equals(gk.extractBytes()));
    });

    test('raises a mismatch when nothing offered to me opens', () {
      final gk = e2ee.generateGroupKey(sodium);
      expect(
          () => openEpochKeys(sodium, identity(), [
                MyWrappedKey(
                    epoch: 0, wrappedKey: e2ee.sealGroupKey(sodium, gk, identity().publicKey)),
              ]),
          throwsA(isA<ChatKeyMismatch>()));
    });

    test('an empty wrap list is simply no keys yet, not a mismatch', () {
      expect(openEpochKeys(sodium, identity(), const []), isEmpty);
    });
  });

  group('ChatKeyStore', () {
    test('namespaces per user so two accounts never share a private key', () async {
      final kv = InMemoryKv();
      final store = ChatKeyStore(kv);
      final a = e2ee.generateIdentity(sodium);
      final b = e2ee.generateIdentity(sodium);
      await store.save('userA', ChatIdentity(a.publicKey, a.privateKey));
      await store.save('userB', ChatIdentity(b.publicKey, b.privateKey));
      expect((await store.load(sodium, 'userA'))!.publicKey, equals(a.publicKey));
      expect((await store.load(sodium, 'userB'))!.publicKey, equals(b.publicKey));
    });

    test('clearCurrent drops the keypair of whoever last signed in', () async {
      final store = ChatKeyStore(InMemoryKv());
      final a = e2ee.generateIdentity(sodium);
      await store.save('userA', ChatIdentity(a.publicKey, a.privateKey));
      await store.clearCurrent();
      expect(await store.load(sodium, 'userA'), isNull);
    });
  });
}
