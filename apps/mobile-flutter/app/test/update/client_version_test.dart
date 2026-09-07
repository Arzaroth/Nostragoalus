import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/token_store.dart';
import 'package:nostragoalus/config.dart';
import 'package:nostragoalus/state/providers.dart';

import '../api/build_client.dart';
import '../api/helpers.dart';
import '../chat/route_adapter.dart';

void main() {
  test('every request says which build it is', () async {
    final (api, adapter) = buildApi([
      Reply(200, const {'competitions': []}),
    ]);

    await api.competitions();
    expect(adapter.requests.single.headers['x-ng-client'], AppConfig.clientId);
    // An unstamped build says `dev`, which no release floor matches, so the
    // server treats it as unidentified rather than refusing it.
    expect(AppConfig.clientId, 'android/dev');
  });

  group('a 426 from the server', () {
    ProviderContainer containerFor(RouteAdapter adapter) {
      final c = ProviderContainer(overrides: [
        dioProvider.overrideWithValue(Dio()..httpClientAdapter = adapter),
        tokenStoreProvider.overrideWithValue(TokenStore(InMemoryKv())),
      ]);
      addTearDown(c.dispose);
      return c;
    }

    test('marks the build outdated, whichever route answered', () async {
      final c = containerFor(RouteAdapter({
        '/api/competitions': () => Reply(426, const {'error': 'client_too_old'}),
      }));
      expect(c.read(clientOutdatedProvider), isFalse);

      await expectLater(
          c.read(apiProvider).competitions(), throwsA(isA<ApiException>()));
      expect(c.read(clientOutdatedProvider), isTrue);
    });

    test('an ordinary error leaves it alone', () async {
      final c = containerFor(RouteAdapter({
        '/api/competitions': () => Reply(500, const {'error': 'boom'}),
      }));

      await expectLater(
          c.read(apiProvider).competitions(), throwsA(isA<ApiException>()));
      expect(c.read(clientOutdatedProvider), isFalse);
    });

    // The build is too old no matter who is holding the phone, so signing out
    // must not clear it - the next sign-in would hit the same wall.
    test('survives an account cache flush', () async {
      final c = containerFor(RouteAdapter({
        '/api/competitions': () => Reply(426, const {'error': 'client_too_old'}),
      }));
      await expectLater(
          c.read(apiProvider).competitions(), throwsA(isA<ApiException>()));

      flushAccountCaches(c.read(rawRefProvider));
      expect(c.read(clientOutdatedProvider), isTrue);
    });
  });
}

/// Hands a test the container's own [Ref], so it can call the same
/// [flushAccountCaches] the auth controller does.
final rawRefProvider = Provider<Ref>((ref) => ref);
