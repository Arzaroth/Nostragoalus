import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/models.gen.dart';
import 'package:nostragoalus/api/token_store.dart';
import 'package:nostragoalus/state/app_prefs.dart';
import 'package:nostragoalus/state/providers.dart';

import '../api/helpers.dart';
import '../chat/route_adapter.dart';

/// Serves per-account bodies: whatever [account] currently is gets baked into
/// the personal reads, so a stale cache is visible as the previous account's
/// numbers.
class _Server {
  _Server(this.account);
  String account;
  int notificationsCalls = 0;
  int statsCalls = 0;

  RouteAdapter get adapter => RouteAdapter({
        '/api/notifications': () {
          notificationsCalls++;
          return Reply(200, {
            'notifications': <Map<String, dynamic>>[],
            'unreadCount': account == 'a' ? 7 : 0,
          });
        },
        '/api/me/stats': () {
          statsCalls++;
          return Reply(200, {
            'stats': {
              'rank': account == 'a' ? 1 : 99,
              'players': 10,
              'totalPoints': 5,
              'exact': 1,
              'outcome': 1,
              'predictions': 2,
              'jokers': 0,
            },
          });
        },
        '/api/auth/sign-out': () => Reply(200, <String, dynamic>{}),
        '/api/auth/get-session': () => Reply(200, <String, dynamic>{}),
      });
}

void main() {
  ProviderContainer containerFor(_Server server, {AppPrefs? prefs, String? token}) {
    final kv = InMemoryKv();
    if (token != null) kv.write('ng_bearer', token);
    final dio = Dio()..httpClientAdapter = server.adapter;
    final c = ProviderContainer(overrides: [
      dioProvider.overrideWithValue(dio),
      tokenStoreProvider.overrideWithValue(TokenStore(kv)),
      if (prefs != null) appPrefsProvider.overrideWithValue(prefs),
    ]);
    addTearDown(c.dispose);
    // The root widget watches this; without it nothing persists.
    c.read(prefsPersistenceProvider);
    return c;
  }

  group('sign-out flushes the previous account (cross-account leak)', () {
    test('personal reads outside the old hand-written list are refetched', () async {
      final server = _Server('a');
      final c = containerFor(server, token: 'tok-a');

      // Providers that the old _invalidateData() list did NOT cover.
      expect((await c.read(notificationsProvider.future)).unreadCount, 7);
      expect((await c.read(meStatsProvider.future)).stats?.rank, 1);
      expect(c.read(unreadCountProvider), 7);

      await c.read(authControllerProvider.notifier).signOut();
      server.account = 'b';

      expect((await c.read(notificationsProvider.future)).unreadCount, 0,
          reason: 'the badge must not survive sign-out');
      expect((await c.read(meStatsProvider.future)).stats?.rank, 99);
      expect(c.read(unreadCountProvider), 0);
      expect(server.notificationsCalls, 2);
      expect(server.statsCalls, 2);
    });

    test('the live StateProviders are reset too', () async {
      final server = _Server('a');
      final c = containerFor(server, token: 'tok-a');
      c.read(presenceProvider.notifier).state = {'someone': 'active'};
      c.read(viewersProvider.notifier).state = {'m1': 3};
      c.read(viewedMatchProvider.notifier).state = 'm1';

      await c.read(authControllerProvider.notifier).signOut();

      expect(c.read(presenceProvider), isEmpty);
      expect(c.read(viewersProvider), isEmpty);
      expect(c.read(viewedMatchProvider), isNull);
    });
  });

  test('a 401 flushes the same caches through the real client wiring', () async {
    final server = _Server('a');
    var unauthorized = false;
    final dio = Dio()
      ..httpClientAdapter = RouteAdapter({
        '/api/notifications': () => unauthorized
            ? Reply(401, {'error': 'nope'})
            : Reply(200, {'notifications': <Map<String, dynamic>>[], 'unreadCount': 7}),
        '/api/auth/get-session': () =>
            unauthorized ? Reply(401, {'error': 'nope'}) : Reply(200, {'user': {'id': 'a', 'email': 'a@x'}}),
      });
    final kv = InMemoryKv();
    await kv.write('ng_bearer', 'tok-a');
    final c = ProviderContainer(overrides: [
      dioProvider.overrideWithValue(dio),
      tokenStoreProvider.overrideWithValue(TokenStore(kv)),
    ]);
    addTearDown(c.dispose);
    c.read(accountCacheGuardProvider);
    await c.read(tokenStoreProvider).load();
    await c.read(authControllerProvider.future);

    expect((await c.read(notificationsProvider.future)).unreadCount, 7);
    final firstApi = c.read(apiProvider);

    unauthorized = true;
    c.invalidate(notificationsProvider);
    await expectLater(c.read(notificationsProvider.future), throwsA(isA<ApiException>()));
    await Future<void>.delayed(Duration.zero);
    expect(await c.read(authControllerProvider.future), isNull,
        reason: 'the 401 must drop the session');
    await Future<void>.delayed(Duration.zero);

    // The dead session took the API facade with it, so every read hanging off
    // it is gone rather than serving the previous account.
    expect(identical(c.read(apiProvider), firstApi), isFalse);
    expect(server.notificationsCalls, 0); // this test drives its own dio
  });

  group('preferences persist', () {
    test('locale seeds from the store and writes back on change', () async {
      final kv = InMemoryKv();
      await kv.write(AppPrefs.localeKey, 'th');
      final prefs = AppPrefs(kv);
      await prefs.load();
      final c = containerFor(_Server('a'), prefs: prefs);

      expect(c.read(localeProvider), const Locale('th'));

      c.read(localeProvider.notifier).state = const Locale('fr');
      await Future<void>.delayed(Duration.zero);
      expect(await kv.read(AppPrefs.localeKey), 'fr');
    });

    test('an unsupported stored language falls back to English', () async {
      final kv = InMemoryKv();
      await kv.write(AppPrefs.localeKey, 'de');
      final prefs = AppPrefs(kv);
      await prefs.load();
      expect(containerFor(_Server('a'), prefs: prefs).read(localeProvider), const Locale('en'));
    });

    test('the selected competition survives a restart', () async {
      final kv = InMemoryKv();
      final first = AppPrefs(kv);
      await first.load();
      final c = containerFor(_Server('a'), prefs: first);
      expect(c.read(selectedCompetitionProvider), isNull);

      c.read(selectedCompetitionProvider.notifier).state = 'wc-2026';
      await Future<void>.delayed(Duration.zero);

      final relaunched = AppPrefs(kv);
      await relaunched.load();
      expect(containerFor(_Server('a'), prefs: relaunched).read(selectedCompetitionProvider),
          'wc-2026');
    });
  });

  test('savePrediction refetches the reads the web contract invalidates', () async {
    var predictions = 0;
    var completeness = 0;
    var board = 0;
    final dio = Dio()
      ..httpClientAdapter = RouteAdapter({
        '/api/leagues/l1/predictions/m1': () => Reply(200, {'id': 'p1'}),
        '/api/predictions': () {
          predictions++;
          return Reply(200, {'predictions': <Map<String, dynamic>>[]});
        },
        '/api/leagues/completeness': () {
          completeness++;
          return Reply(200, {'leagues': <Map<String, dynamic>>[]});
        },
        '/api/leagues/l1/board': () {
          board++;
          return Reply(200, {'rows': <Map<String, dynamic>>[], 'mode': 'easy'});
        },
      });
    final c = ProviderContainer(overrides: [
      dioProvider.overrideWithValue(dio),
      tokenStoreProvider.overrideWithValue(TokenStore(InMemoryKv())),
    ]);
    addTearDown(c.dispose);

    // Keep the two reads subscribed, or an autoDispose family drops before the
    // invalidation can be observed.
    final subs = [
      c.listen(myPredictionsProvider, (_, __) {}),
      c.listen(leagueCompletenessProvider, (_, __) {}),
    ];
    addTearDown(() {
      for (final s in subs) {
        s.close();
      }
    });
    await c.read(myPredictionsProvider.future);
    await c.read(leagueCompletenessProvider.future);
    expect(predictions, 1);
    expect(completeness, 1);

    await c.read(savePredictionProvider)(
        'l1', 'm1', const PredictionInput(home: 2, away: 1));
    await c.read(myPredictionsProvider.future);
    await c.read(leagueCompletenessProvider.future);

    expect(predictions, 2, reason: 'the saved pick must show in my predictions');
    expect(completeness, 2, reason: 'the pick-nudge banner must stop nagging');
    expect(board, 0, reason: 'the board was never read, so nothing to refetch');
  });
}
