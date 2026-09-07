import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/token_store.dart';
import 'package:nostragoalus/leagues/league_selection.dart';
import 'package:nostragoalus/state/app_prefs.dart';
import 'package:nostragoalus/state/providers.dart';

import '../api/helpers.dart';
import '../chat/route_adapter.dart';
import '../ui/league_fixtures.dart';

const _emptyBoard = {'competition': null, 'rows': <Map<String, dynamic>>[]};

void main() {
  ProviderContainer containerFor(
    RouteAdapter adapter, {
    AppPrefs? prefs,
    String? competition,
  }) {
    final c = ProviderContainer(overrides: [
      dioProvider.overrideWithValue(Dio()..httpClientAdapter = adapter),
      tokenStoreProvider.overrideWithValue(TokenStore(InMemoryKv())),
      if (prefs != null) appPrefsProvider.overrideWithValue(prefs),
      selectedCompetitionProvider.overrideWith((ref) => competition),
    ]);
    addTearDown(c.dispose);
    return c;
  }

  RouteAdapter leaguesAdapter(List<Map<String, dynamic>> leagues) => RouteAdapter({
        '/api/leagues': () => Reply(200, {'leagues': leagues}),
        '/api/leaderboard': () => Reply(200, _emptyBoard),
        '/api/predictions/crowd': () => Reply(200, const {'totals': {}}),
      });

  test('the lens is per competition and starts off', () {
    final c = containerFor(leaguesAdapter(const []), competition: 'wc26');
    expect(c.read(selectedLeagueIdProvider), isNull);

    c.read(leagueSelectionsProvider.notifier).state = const {'wc26': 'l1', 'euro28': 'l2'};
    expect(c.read(selectedLeagueIdProvider), 'l1');
  });

  test('a stored lens is restored on launch', () {
    final prefs = AppPrefs(InMemoryKv())
      ..leagueSelections = encodeLeagueSelections(const {'wc26': 'l1'});
    final c = containerFor(leaguesAdapter(const []), prefs: prefs, competition: 'wc26');
    expect(c.read(selectedLeagueIdProvider), 'l1');
  });

  test('a chosen lens is written back to the store, and clearing wipes it', () {
    final prefs = AppPrefs(InMemoryKv());
    final c = containerFor(leaguesAdapter(const []), prefs: prefs, competition: 'wc26');
    c.read(prefsPersistenceProvider);

    c.read(leagueSelectionsProvider.notifier).state = const {'wc26': 'l1'};
    expect(decodeLeagueSelections(prefs.leagueSelections), {'wc26': 'l1'});

    c.read(leagueSelectionsProvider.notifier).state = const {};
    expect(prefs.leagueSelections, isNull);
  });

  // The two tests above stop at the in-memory field. This one proves the key the
  // value is filed under survives a cold start, which is the whole "remembered
  // per competition" promise.
  test('the lens round-trips through the keystore', () async {
    final kv = InMemoryKv();
    final writer = AppPrefs(kv);
    final c = containerFor(leaguesAdapter(const []), prefs: writer, competition: 'wc26');
    c.read(prefsPersistenceProvider);
    c.read(leagueSelectionsProvider.notifier).state = const {'wc26': 'l1'};

    final reloaded = AppPrefs(kv);
    await reloaded.load();
    final restarted = containerFor(leaguesAdapter(const []),
        prefs: reloaded, competition: 'wc26');
    expect(restarted.read(selectedLeagueIdProvider), 'l1');
  });

  test('the leaderboard read carries the lens instead of the competition', () async {
    final adapter = leaguesAdapter(const []);
    final c = containerFor(adapter, competition: 'wc26');
    c.read(leagueSelectionsProvider.notifier).state = const {'wc26': 'l1'};

    await c.read(leaderboardProvider.future);
    expect(adapter.queries['/api/leaderboard'], {'league': 'l1'});
  });

  test('the league crowd read asks the server for that league only', () async {
    final adapter = leaguesAdapter(const []);
    final c = containerFor(adapter, competition: 'wc26');
    c.read(leagueSelectionsProvider.notifier).state = const {'wc26': 'l1'};

    await c.read(leagueCrowdTotalsProvider.future);
    expect(adapter.calls, contains('GET /api/predictions/crowd'));
    expect(adapter.queries['/api/predictions/crowd'], {'league': 'l1'});
  });

  test('the league crowd read is skipped entirely with no lens', () async {
    final adapter = leaguesAdapter(const []);
    final c = containerFor(adapter, competition: 'wc26');

    expect(await c.read(leagueCrowdTotalsProvider.future), isEmpty);
    expect(adapter.calls, isNot(contains('GET /api/predictions/crowd')));
  });

  group('pruning', () {
    test('drops a lens on a league the user has left', () async {
      final c = containerFor(leaguesAdapter([leagueJson('l2', 'Other')]), competition: 'wc26');
      c.read(leagueSelectionsProvider.notifier).state = const {'wc26': 'gone'};
      c.read(leagueLensGuardProvider);

      await c.read(leaguesProvider.future);
      expect(c.read(selectedLeagueIdProvider), isNull);
    });

    test('keeps a lens that is still a league the user is in', () async {
      final c = containerFor(leaguesAdapter([leagueJson('l1', 'Office')]), competition: 'wc26');
      c.read(leagueSelectionsProvider.notifier).state = const {'wc26': 'l1'};
      c.read(leagueLensGuardProvider);

      await c.read(leaguesProvider.future);
      expect(c.read(selectedLeagueIdProvider), 'l1');
    });

    test('leaves the lens alone when the first leagues fetch fails', () async {
      final c = containerFor(
          RouteAdapter({'/api/leagues': () => Reply(500, const {'error': 'boom'})}),
          competition: 'wc26');
      c.read(leagueSelectionsProvider.notifier).state = const {'wc26': 'l1'};
      c.read(leagueLensGuardProvider);

      await expectLater(c.read(leaguesProvider.future), throwsA(isA<Object>()));
      expect(c.read(selectedLeagueIdProvider), 'l1');
    });

    // Riverpod keeps the previous value alongside a loading state, so `hasValue`
    // is true mid-refetch. Pruning then would erase a league the user joined and
    // selected while the list was still catching up.
    test('leaves the lens alone while the leagues list is refetching', () async {
      final c = containerFor(leaguesAdapter([leagueJson('l1', 'Office')]), competition: 'wc26');
      c.read(leagueLensGuardProvider);
      await c.read(leaguesProvider.future);

      c.invalidate(leaguesProvider);
      c.read(leagueSelectionsProvider.notifier).state = const {'wc26': 'just-joined'};
      c.read(leaguesProvider);
      expect(c.read(selectedLeagueIdProvider), 'just-joined');
    });

    // Riverpod ALSO keeps the previous value alongside an error, so a failed
    // refetch after a competition switch would otherwise prune the new
    // competition's lens against the old competition's list.
    test('leaves the lens alone when a refetch fails over a previous list', () async {
      var fail = false;
      final adapter = RouteAdapter({
        '/api/leagues': () => fail
            ? Reply(500, const {'error': 'boom'})
            : Reply(200, {
                'leagues': [leagueJson('l1', 'Office')],
              }),
        '/api/leaderboard': () => Reply(200, _emptyBoard),
      });
      final c = containerFor(adapter, competition: 'wc26');
      c.read(leagueLensGuardProvider);
      await c.read(leaguesProvider.future);

      c.read(leagueSelectionsProvider.notifier).state = const {'wc26': 'l9'};
      fail = true;
      c.invalidate(leaguesProvider);
      await expectLater(c.read(leaguesProvider.future), throwsA(isA<Object>()));

      expect(c.read(selectedLeagueIdProvider), 'l9');
    });
  });

  // The leagues list keeps naming l1 in this group: an empty list would let the
  // prune clear the lens first and every assertion below would pass vacuously.
  group('a lens the server refuses', () {
    test('a 404 from the leaderboard clears it', () async {
      final c = containerFor(
          RouteAdapter({
            '/api/leagues': () => Reply(200, {
                  'leagues': [leagueJson('l1', 'Office')],
                }),
            '/api/leaderboard': () => Reply(404, const {'error': 'gone'}),
          }),
          competition: 'wc26');
      c.read(leagueSelectionsProvider.notifier).state = const {'wc26': 'l1'};
      c.read(leagueLensGuardProvider);

      await expectLater(c.read(leaderboardProvider.future), throwsA(isA<Object>()));
      expect(c.read(selectedLeagueIdProvider), isNull);
    });

    // The leaderboard is not the only lensed read: a user sitting on a match
    // detail would otherwise keep a dead lens until they opened the board.
    test('a 404 from the league crowd read clears it', () async {
      final c = containerFor(
          RouteAdapter({
            '/api/leagues': () => Reply(200, {
                  'leagues': [leagueJson('l1', 'Office')],
                }),
            '/api/predictions/crowd': () => Reply(404, const {'error': 'gone'}),
          }),
          competition: 'wc26');
      c.read(leagueSelectionsProvider.notifier).state = const {'wc26': 'l1'};
      c.read(leagueLensGuardProvider);

      await expectLater(c.read(leagueCrowdTotalsProvider.future), throwsA(isA<Object>()));
      expect(c.read(selectedLeagueIdProvider), isNull);
    });

    test('a 500 leaves it alone - retrying is the right move there', () async {
      final c = containerFor(
          RouteAdapter({
            '/api/leagues': () => Reply(200, {
                  'leagues': [leagueJson('l1', 'Office')],
                }),
            '/api/leaderboard': () => Reply(500, const {'error': 'boom'}),
          }),
          competition: 'wc26');
      c.read(leagueSelectionsProvider.notifier).state = const {'wc26': 'l1'};
      c.read(leagueLensGuardProvider);

      await expectLater(c.read(leaderboardProvider.future), throwsA(isA<Object>()));
      expect(c.read(selectedLeagueIdProvider), 'l1');
    });
  });
}
