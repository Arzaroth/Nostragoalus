import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/token_store.dart';
import 'package:nostragoalus/leagues/league_selection.dart';
import 'package:nostragoalus/state/app_prefs.dart';
import 'package:nostragoalus/state/providers.dart';

import '../api/helpers.dart';
import '../chat/route_adapter.dart';

Map<String, dynamic> _league(String id, String name) => {
      'id': id,
      'name': name,
      'competition': {'id': 'c1', 'slug': 'wc26', 'name': 'WC 26'},
      'mode': 'NORMAL',
      'role': 'MEMBER',
      'visibility': 'PRIVATE',
      'picksSynced': false,
      'chatEnabled': true,
      'memberCount': 3,
    };

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
        '/api/leaderboard': () => Reply(200, const {'competition': null, 'rows': []}),
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

  test('the leaderboard read carries the lens instead of the competition', () async {
    final adapter = leaguesAdapter(const []);
    final c = containerFor(adapter, competition: 'wc26');
    c.read(leagueSelectionsProvider.notifier).state = const {'wc26': 'l1'};

    await c.read(leaderboardProvider.future);
    expect(adapter.queries['/api/leaderboard'], {'league': 'l1'});
  });

  test('the league crowd read is skipped entirely with no lens', () async {
    final adapter = leaguesAdapter(const []);
    final c = containerFor(adapter, competition: 'wc26');

    expect(await c.read(leagueCrowdTotalsProvider.future), isEmpty);
    expect(adapter.calls, isNot(contains('GET /api/predictions/crowd')));
  });

  group('pruning', () {
    test('drops a lens on a league the user has left', () async {
      final c = containerFor(leaguesAdapter([_league('l2', 'Other')]), competition: 'wc26');
      c.read(leagueSelectionsProvider.notifier).state = const {'wc26': 'gone'};
      c.read(leagueSelectionPruneProvider);

      await c.read(leaguesProvider.future);
      expect(c.read(selectedLeagueIdProvider), isNull);
    });

    test('keeps a lens that is still a league the user is in', () async {
      final c = containerFor(leaguesAdapter([_league('l1', 'Office')]), competition: 'wc26');
      c.read(leagueSelectionsProvider.notifier).state = const {'wc26': 'l1'};
      c.read(leagueSelectionPruneProvider);

      await c.read(leaguesProvider.future);
      expect(c.read(selectedLeagueIdProvider), 'l1');
    });

    // A league joined a moment ago is written to the lens while the leagues
    // list is still serving the previous one; pruning against that would erase
    // the selection just made.
    test('leaves the lens alone while the leagues list is still failing', () async {
      final c = containerFor(
          RouteAdapter({'/api/leagues': () => Reply(500, const {'error': 'boom'})}),
          competition: 'wc26');
      c.read(leagueSelectionsProvider.notifier).state = const {'wc26': 'l1'};
      c.read(leagueSelectionPruneProvider);

      await expectLater(c.read(leaguesProvider.future), throwsA(isA<Object>()));
      expect(c.read(selectedLeagueIdProvider), 'l1');
    });
  });
}
