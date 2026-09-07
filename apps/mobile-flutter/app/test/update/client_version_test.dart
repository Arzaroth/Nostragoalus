import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/token_store.dart';
import 'package:nostragoalus/config.dart';
import 'package:nostragoalus/state/providers.dart';

import '../api/build_client.dart';
import '../api/helpers.dart';
import '../chat/route_adapter.dart';

Reply _refusal({String? minimum = '4.9.0', String? downloadUrl = '/download/x.apk'}) =>
    Reply(426, {
      'data': {
        'error': 'client_too_old',
        if (minimum != null) 'minimum': minimum,
        if (downloadUrl != null) 'downloadUrl': downloadUrl,
      },
    });

void main() {
  test('every request says which build it is', () async {
    final (api, adapter) = buildApi([Reply(200, const {'competitions': []})]);

    await api.competitions();
    expect(adapter.requests.single.headers['x-ng-client'], AppConfig.clientId);
    // An unstamped build says `dev`, which the server's version pattern rejects,
    // so it is treated as unidentified rather than refused. The server side
    // pins the same string (`server/utils/clients/service.test.ts`).
    expect(AppConfig.clientId, 'android/dev');
  });

  group('a 426 from the server', () {
    ProviderContainer containerFor(RouteAdapter adapter, {String? token}) {
      final kv = InMemoryKv();
      if (token != null) kv.write('ng_bearer', token);
      final c = ProviderContainer(overrides: [
        dioProvider.overrideWithValue(Dio()..httpClientAdapter = adapter),
        tokenStoreProvider.overrideWithValue(TokenStore(kv)),
      ]);
      addTearDown(c.dispose);
      return c;
    }

    test('marks the build outdated and keeps what the server said', () async {
      final c = containerFor(RouteAdapter({'/api/competitions': _refusal}));
      expect(c.read(clientOutdatedProvider), isFalse);

      await expectLater(c.read(apiProvider).competitions(), throwsA(isA<ApiException>()));

      expect(c.read(clientOutdatedProvider), isTrue);
      expect(c.read(clientRefusalProvider)?.minimum, '4.9.0');
      expect(c.read(clientRefusalProvider)?.path, '/download/x.apk');
    });

    // The auth client is the one that issues the session read on launch, so in
    // practice it sees the 426 first. Its wiring is a separate line from
    // apiProvider's and needs its own assertion.
    test('the auth client flips the gate too', () async {
      // The cold-start shape: a stored session, and the session read is the
      // first request out.
      final c = containerFor(RouteAdapter({'/api/auth/get-session': _refusal}),
          token: 'stored-token');
      await c.read(tokenStoreProvider).load();

      await c.read(authRepositoryProvider).currentUser();
      expect(c.read(clientOutdatedProvider), isTrue);
    });

    // A captive portal, proxy or CDN edge can answer 426. Blanking a good build
    // over one of those would be worse than the failure this prevents.
    test('a 426 that is not ours is ignored', () async {
      final c = containerFor(RouteAdapter({
        '/api/competitions': () => Reply(426, const {'error': 'upgrade your tls'}),
      }));

      await expectLater(c.read(apiProvider).competitions(), throwsA(isA<ApiException>()));
      expect(c.read(clientOutdatedProvider), isFalse);
    });

    test('an ordinary error leaves it alone', () async {
      final c = containerFor(RouteAdapter({
        '/api/competitions': () => Reply(500, const {'error': 'boom'}),
      }));

      await expectLater(c.read(apiProvider).competitions(), throwsA(isA<ApiException>()));
      expect(c.read(clientOutdatedProvider), isFalse);
    });

    test('falls back to the known download path when the server sent none', () async {
      final c = containerFor(RouteAdapter({
        '/api/competitions': () => _refusal(downloadUrl: null),
      }));

      await expectLater(c.read(apiProvider).competitions(), throwsA(isA<ApiException>()));
      expect(c.read(clientRefusalProvider)?.path, fallbackDownloadPath);
    });
  });

  // The provider body and MeApi.androidRelease() were previously reached by no
  // test - every widget test overrides the provider, so a wrong path or a
  // renamed field would have shipped green.
  group('the release read', () {
    test('parses the published build off the real route', () async {
      final adapter = RouteAdapter({
        '/api/app/android': () => Reply(200, const {
              'available': true,
              'version': '9.9.9',
              'sizeBytes': 94013880,
              'sha256': 'deadbeef',
              'downloadUrl': '/download/nostragoalus.apk',
            }),
      });
      final c = ProviderContainer(overrides: [
        dioProvider.overrideWithValue(Dio()..httpClientAdapter = adapter),
        tokenStoreProvider.overrideWithValue(TokenStore(InMemoryKv())),
      ]);
      addTearDown(c.dispose);

      final check = await c.read(appReleaseProvider.future);
      expect(adapter.calls, contains('GET /api/app/android'));
      // The test binary is unstamped, so the honest answer is that there is
      // nothing to compare - not "you are behind".
      expect(check.state, UpdateState.unversioned);
    });
  });
}
