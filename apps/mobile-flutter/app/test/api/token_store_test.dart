import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/token_store.dart';

import 'helpers.dart';

const _channel = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('TokenStore over an in-memory kv', () {
    test('starts empty and mirrors what load() reads back', () async {
      final kv = InMemoryKv();
      final store = TokenStore(kv);

      expect(store.token, isNull);
      expect(await store.load(), isNull);

      await kv.write('ng_bearer', 'from-keystore');
      expect(await store.load(), 'from-keystore');
      expect(store.token, 'from-keystore');
    });

    test('save writes through and updates the in-memory mirror', () async {
      final kv = InMemoryKv();
      final store = TokenStore(kv);

      await store.save('tok');

      expect(store.token, 'tok');
      expect(await kv.read('ng_bearer'), 'tok');
    });

    test('clear drops the token from both the mirror and the keystore', () async {
      final kv = InMemoryKv();
      final store = TokenStore(kv);
      await store.save('tok');

      await store.clear();

      expect(store.token, isNull);
      expect(await kv.read('ng_bearer'), isNull);
    });
  });

  group('FlutterSecureKv talks to the platform keystore', () {
    final calls = <MethodCall>[];

    setUp(() {
      calls.clear();
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(_channel, (call) async {
        calls.add(call);
        return call.method == 'read' ? 'stored' : null;
      });
    });

    tearDown(() {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(_channel, null);
    });

    test('read, write and delete reach the plugin with the key', () async {
      const kv = FlutterSecureKv();

      expect(await kv.read('k'), 'stored');
      await kv.write('k', 'v');
      await kv.delete('k');

      expect(calls.map((c) => c.method), ['read', 'write', 'delete']);
      expect(calls.every((c) => (c.arguments as Map)['key'] == 'k'), isTrue);
      expect((calls[1].arguments as Map)['value'], 'v');
    });

    test('the default TokenStore uses the platform keystore', () async {
      expect(await TokenStore().load(), 'stored');
      expect(calls.single.method, 'read');
    });
  });
}
