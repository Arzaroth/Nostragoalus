import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/api_client.dart';
import 'package:nostragoalus/api/auth_repository.dart';
import 'package:nostragoalus/api/models.gen.dart';
import 'package:nostragoalus/api/api.dart';
import 'package:nostragoalus/api/token_store.dart';
import 'package:nostragoalus/i18n/i18n.dart';
import 'package:nostragoalus/i18n/i18n_scope.dart';
import 'package:nostragoalus/state/providers.dart';
import 'package:nostragoalus/ui/analytics_screen.dart';
import 'package:nostragoalus/ui/cabinet_screen.dart';
import 'package:nostragoalus/ui/compare_screen.dart';
import 'package:nostragoalus/ui/match/crowd_consensus.dart';
import 'package:nostragoalus/ui/match/match_detail_screen.dart';
import 'package:nostragoalus/ui/match/prediction_editor.dart';
import 'package:nostragoalus/ui/match/timeline_label.dart';
import 'package:nostragoalus/ui/matches_screen.dart';

Widget host(Widget child, Map<String, dynamic> i18nMap, List<Override> overrides) {
  final i18n = I18n(i18nMap, const {}, const Locale('en'));
  return ProviderScope(
    overrides: overrides,
    // I18nScope sits ABOVE MaterialApp in the real app (lib/app.dart), so
    // dialogs and modal sheets - separate routes - can still translate.
    child: I18nScope(i18n: i18n, child: MaterialApp(home: child)),
  );
}

class _FakeAuth extends AuthController {
  _FakeAuth(this.user);
  final AuthUser? user;
  @override
  Future<AuthUser?> build() async => user;
}

Override authOverride({bool showCrowd = false}) => authControllerProvider.overrideWith(
      () => _FakeAuth(AuthUser(id: 'me', email: 'me@x.io', showCrowd: showCrowd)),
    );

/// Records joker calls so a double tap is observable.
/// The api surface is a set of extensions on [ApiClient], so a fake overrides
/// the transport underneath them rather than the (non-virtual) endpoint method.
class _FakeApi extends ApiClient {
  _FakeApi() : super(TokenStore());
  int jokerCalls = 0;
  bool fail = false;

  @override
  Future<Map<String, dynamic>> putJson(String path, {Object? body}) async {
    jokerCalls++;
    await Future<void>.delayed(const Duration(milliseconds: 50));
    if (fail) throw ApiException(500, 'nope');
    return {'ok': true};
  }
}

MatchesResponseMatch match({
  String id = 'm1',
  String roundId = 'r1',
  String roundLabel = 'Round 1',
  int sort = 1,
  String status = 'SCHEDULED',
  String stage = 'GROUP',
}) =>
    MatchesResponseMatch.fromJson({
      'id': id,
      'competitionId': 'c1',
      'providerMatchId': 'p$id',
      'stage': stage,
      'homeTeam': 'Alpha',
      'awayTeam': 'Bravo',
      'kickoffTime': '2026-07-01T18:00:00.000Z',
      'status': status,
      'scoringState': 'PENDING',
      'roundId': roundId,
      'roundLabel': roundLabel,
      'roundSortOrder': sort,
      'isLocked': false,
    });

MatchDetailResponse detail({MyPrediction? mine, bool locked = false}) => MatchDetailResponse(
      match: MatchDetailResponseMatch.fromJson({
        'id': 'm1',
        'competitionId': 'c1',
        'providerMatchId': 'p1',
        'stage': 'GROUP',
        'homeTeam': 'Alpha',
        'awayTeam': 'Bravo',
        'kickoffTime': '2026-07-01T18:00:00.000Z',
        'status': 'SCHEDULED',
        'scoringState': 'PENDING',
        'roundId': 'r1',
        'roundLabel': 'Round 1',
        'roundSortOrder': 1,
      }),
      myPrediction: mine,
      isLocked: locked,
    );

LeaguesResponseLeague league({String id = 'l1', String name = 'Aces', String comp = 'c1'}) =>
    LeaguesResponseLeague.fromJson({
      'id': id,
      'name': name,
      'visibility': 'PRIVATE',
      'mode': 'NORMAL',
      'role': 'MEMBER',
      'picksSynced': true,
      'memberCount': 3,
      'chatEnabled': true,
      'competition': {'id': comp, 'slug': comp, 'name': comp},
    });

const _i18n = {
  'nav': {'matches': 'Matches', 'scorers': 'Scorers', 'leaderboard': 'League'},
  'match': {
    'timeline': 'Timeline',
    'lineups': 'Line-ups',
    'insights': 'Insights',
    'liveDetail': 'Live',
    'media': 'Media',
    'noEvents': 'No events yet.',
    'noLineups': 'No line-ups',
    'noLiveDetail': 'No live detail',
    'noMedia': 'No media',
    'possession': 'Possession',
    'statusLabel': {'scheduled': 'Scheduled'},
    'pbp': {'goal': '{player} scores'},
    'captainShort': 'C',
  },
  'picks': {
    'yourPrediction': 'Your prediction',
    'save': 'Save',
    'saved': 'Prediction saved',
    'joker': 'Joker',
    'outcomeOnly': 'Outcome only',
    'locked': 'Predictions locked',
    'noLeagueForCompetition': 'No league in this competition',
    'leagueForPick': 'League',
  },
  'leaderboard': {'empty': 'No scores yet', 'exact': 'exact', 'correct': 'correct'},
  'crowd': {'title': 'Crowd consensus', 'count': '{n} predictions'},
  'err': {'generic': 'Something went wrong on our side.'},
  'bestScorer': {'topScorers': 'Top scorers'},
  'stats': {'empty': 'No stats', 'assists': 'Assists'},
  'matches': {'empty': 'No matches'},
};

List<Override> matchOverrides({
  MatchDetailResponse? res,
  List<LeaguesResponseLeague> leagues = const [],
}) =>
    [
      authOverride(),
      matchProvider('m1').overrideWith((ref) async => res ?? detail()),
      leaguesProvider.overrideWith((ref) async => LeaguesResponse(leagues: leagues)),
      crowdTotalsProvider.overrideWith((ref) async => const <String, CrowdResponseTotal>{}),
      reactionsProvider('m1').overrideWith((ref) async =>
          const ReactionsResponse(totals: Total(fire: 0, goal: 0, wow: 0, laugh: 0, sad: 0, angry: 0))),
      pastPicksProvider('m1').overrideWith((ref) async => const PastPicksResponse(scope: ScopeValue.none)),
      matchTimelineProvider('m1').overrideWith((ref) async => const MatchTimelineResponse(events: [
            Event(kind: 'goal', minute: "23'", playerName: 'VAN DIJK', homeScore: 1, awayScore: 0),
          ])),
      matchLineupsProvider('m1')
          .overrideWith((ref) async => const MatchLineupsResponse(lineups: null)),
      matchScorersProvider('m1')
          .overrideWith((ref) async => const ScorersResponse(scorers: [], assists: [])),
      matchInsightsProvider('m1').overrideWith((ref) async => const MatchInsightsResponse(
            form: MatchInsightsResponseForm(home: [], away: []),
            next: Next(home: [], away: []),
            headToHead: [],
            possession: Possession(home: 60, away: 40),
            goals: [],
          )),
      matchLiveDetailProvider('m1').overrideWith((ref) async => null),
      matchLeagueStandingsProvider('m1').overrideWith((ref) async =>
          const MatchLeagueStandingsResponse(
              scope: MatchLeagueStandingsResponseScopeValue.upcoming, rows: [], notPredicted: 0)),
      matchMediaProvider('m1').overrideWith((ref) async => const MatchMediaResponse(media: [])),
    ];

void main() {
  group('pbp label helper', () {
    test('a player kind resolves to its templated key', () {
      final spec = pbpTextSpec(kind: 'goal', playerName: 'VAN DIJK');
      expect(spec.key, 'match.pbp.goal');
      expect(spec.params!['player'], 'Van Dijk');
    });

    test('a sub without both names falls back to the kind label', () {
      expect(pbpTextSpec(kind: 'sub', playerInName: 'A').key, 'match.pbpKind.sub');
      expect(
        pbpTextSpec(kind: 'sub', playerInName: 'A B', playerOutName: 'C D').key,
        'match.pbp.sub',
      );
    });

    test('VAR keeps the feed text as a literal', () {
      final spec = pbpTextSpec(kind: 'var', text: 'Goal disallowed');
      expect(spec.key, isEmpty);
      expect(spec.literal, 'Goal disallowed');
      expect(pbpTextSpec(kind: 'var').key, 'match.pbpKind.var');
    });

    test('period maps its own sub-key, unknown kinds render nothing', () {
      expect(pbpTextSpec(kind: 'period', periodKind: 'half-time').key, 'match.pbp.period.halfTime');
      expect(pbpTextSpec(kind: 'period', periodKind: 'nonsense').key, isEmpty);
      expect(pbpTextSpec(kind: 'quidditch').key, isEmpty);
    });

    test('formatPlayerName only touches shouted names', () {
      expect(formatPlayerName('DE BRUYNE'), 'De Bruyne');
      expect(formatPlayerName("N'GOLO"), "N'Golo");
      expect(formatPlayerName('Kylian Mbappé'), 'Kylian Mbappé');
      expect(formatPlayerName(null), '');
    });

    test('every icon kind resolves to a label key', () {
      for (final kind in timelineIcons.keys.where((k) => k != 'period')) {
        expect(pbpTextSpec(kind: kind).key, isNotEmpty, reason: kind);
      }
    });
  });

  group('groupByRound', () {
    test('orders rounds and folds a concluded one', () {
      final rounds = groupByRound([
        match(id: 'b', roundId: 'r2', sort: 2),
        match(id: 'a', roundId: 'r1', sort: 1, status: 'FINISHED'),
      ]);
      expect(rounds.map((r) => r.id), ['r1', 'r2']);
      expect(rounds[0].collapsed, isTrue);
      expect(rounds[1].collapsed, isFalse);
    });

    test('the final never folds, even fully played', () {
      final rounds = groupByRound([
        match(id: 'f', roundId: 'rf', sort: 9, status: 'FINISHED', stage: 'FINAL'),
      ]);
      expect(rounds.single.allPlayed, isTrue);
      expect(rounds.single.collapsed, isFalse);
    });

    test('a round with one match left to play stays open', () {
      final rounds = groupByRound([
        match(id: 'a', roundId: 'r1', status: 'FINISHED'),
        match(id: 'b', roundId: 'r1'),
      ]);
      expect(rounds.single.matches, hasLength(2));
      expect(rounds.single.collapsed, isFalse);
    });
  });

  group('MatchDetailScreen', () {
    testWidgets('mounts and every tab is reachable', (tester) async {
      tester.view.physicalSize = const Size(1400, 2400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);

      await tester.pumpWidget(host(
        const MatchDetailScreen(matchId: 'm1'),
        _i18n,
        matchOverrides(leagues: [league()]),
      ));
      await tester.pumpAndSettle();

      final tabs = tester.widgetList<Tab>(find.byType(Tab)).toList();
      expect(tabs, hasLength(8));
      expect(find.byType(TabBarView), findsOneWidget);

      // Tab 0 is the editor; walk the rest and let each tab's body build.
      final markers = <int, String>{
        1: 'Van Dijk scores',
        2: 'No line-ups',
        3: 'No stats',
        4: 'Possession',
        5: 'No live detail',
        6: 'No scores yet',
        7: 'No media',
      };
      for (var i = 1; i < tabs.length; i++) {
        final tab = find.byType(Tab).at(i);
        await tester.ensureVisible(tab);
        await tester.pumpAndSettle();
        await tester.tap(tab);
        await tester.pumpAndSettle();
        expect(find.text(markers[i]!), findsWidgets, reason: 'tab $i');
      }
    });
  });

  group('PredictionEditor', () {
    Widget editor(List<Override> overrides, {MyPrediction? mine, bool locked = false}) => host(
          Scaffold(
            body: PredictionEditor(
              matchId: 'm1',
              competitionId: 'c1',
              homeTeam: 'Alpha',
              awayTeam: 'Bravo',
              current: mine,
              isLocked: locked,
            ),
          ),
          _i18n,
          overrides,
        );

    testWidgets('a locked match shows the lock, no controls', (tester) async {
      await tester.pumpWidget(editor([
        authOverride(),
        leaguesProvider.overrideWith((ref) async => LeaguesResponse(leagues: [league()])),
      ], locked: true));
      await tester.pumpAndSettle();
      expect(find.text('Predictions locked'), findsOneWidget);
      expect(find.text('Save'), findsNothing);
    });

    testWidgets('no league in this competition offers no editor', (tester) async {
      await tester.pumpWidget(editor([
        authOverride(),
        leaguesProvider
            .overrideWith((ref) async => LeaguesResponse(leagues: [league(comp: 'other')])),
      ]));
      await tester.pumpAndSettle();
      expect(find.text('No league in this competition'), findsOneWidget);
      expect(find.text('Save'), findsNothing);
    });

    testWidgets('several leagues in the competition are a choice, not a guess', (tester) async {
      await tester.pumpWidget(editor([
        authOverride(),
        leaguesProvider.overrideWith((ref) async => LeaguesResponse(leagues: [
              league(),
              league(id: 'l2', name: 'Bees'),
              league(id: 'l3', name: 'Other comp', comp: 'c9'),
            ])),
      ]));
      await tester.pumpAndSettle();
      expect(find.byType(DropdownButtonFormField<String>), findsOneWidget);
      expect(find.text('Other comp'), findsNothing);
    });

    testWidgets('a failed save surfaces the server reason', (tester) async {
      await tester.pumpWidget(editor([
        authOverride(),
        leaguesProvider.overrideWith((ref) async => LeaguesResponse(leagues: [league()])),
        savePredictionProvider.overrideWithValue(
          (leagueId, mode, matchId, input) async =>
              throw ApiException(400, 'bad', {'message': 'Too late'}),
        ),
      ]));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(find.text('Too late'), findsOneWidget);
    });

    testWidgets('the joker switch fires once per tap and moves optimistically',
        (tester) async {
      final api = _FakeApi();
      await tester.pumpWidget(editor([
        authOverride(),
        apiProvider.overrideWithValue(api),
        leaguesProvider.overrideWith((ref) async => LeaguesResponse(leagues: [league()])),
      ]));
      await tester.pumpAndSettle();

      await tester.tap(find.byType(SwitchListTile).last);
      await tester.pump();
      expect(tester.widget<SwitchListTile>(find.byType(SwitchListTile).last).value, isTrue);
      // Second tap while the first is still in flight.
      await tester.tap(find.byType(SwitchListTile).last, warnIfMissed: false);
      await tester.pumpAndSettle();
      expect(api.jokerCalls, 1);
    });
  });

  group('CrowdConsensus', () {
    Widget crowd(List<Override> overrides) => host(
          const Scaffold(
              body: CrowdConsensus(matchId: 'm1', homeTeam: 'Alpha', awayTeam: 'Bravo')),
          _i18n,
          overrides,
        );

    testWidgets('hidden when the preference is off', (tester) async {
      await tester.pumpWidget(crowd([
        authOverride(),
        crowdTotalsProvider.overrideWith((ref) async => <String, CrowdResponseTotal>{
              'm1': const CrowdResponseTotal(home: 2, away: 1, count: 9),
            }),
      ]));
      await tester.pumpAndSettle();
      expect(find.text('Crowd consensus'), findsNothing);
    });

    testWidgets('hidden below the anonymity floor (count <= 0)', (tester) async {
      await tester.pumpWidget(crowd([
        authOverride(showCrowd: true),
        crowdTotalsProvider.overrideWith((ref) async => <String, CrowdResponseTotal>{
              'm1': const CrowdResponseTotal(home: 0, away: 0, count: -1),
            }),
      ]));
      await tester.pumpAndSettle();
      expect(find.text('Crowd consensus'), findsNothing);
    });

    testWidgets('shown with the consensus score and the count', (tester) async {
      await tester.pumpWidget(crowd([
        authOverride(showCrowd: true),
        crowdTotalsProvider.overrideWith((ref) async => <String, CrowdResponseTotal>{
              'm1': const CrowdResponseTotal(home: 2, away: 1, count: 9),
            }),
      ]));
      await tester.pumpAndSettle();
      expect(find.text('Crowd consensus'), findsOneWidget);
      expect(find.text('2 - 1'), findsOneWidget);
      expect(find.text('9 predictions'), findsOneWidget);
    });
  });

  group('CabinetScreen', () {
    CabinetResponse cabinet({required bool owner, int earned = 1}) => CabinetResponse.fromJson({
          'userId': 'u1',
          'displayName': 'Jo',
          'isOwner': owner,
          'trophies': [],
          'showcase': [],
          'achievements': [
            for (var i = 0; i < earned; i++)
              {
                'key': 'badge$i',
                'category': 'c',
                'scope': 's',
                'hidden': false,
                'tiers': [],
                'rarity': [],
                'earned': {'tier': 'GOLD', 'progress': 1, 'unlockedAt': '2026-01-01'},
              },
            {
              'key': 'locked1',
              'category': 'c',
              'scope': 's',
              'hidden': false,
              'current': 2,
              'rarity': [],
              'tiers': [
                {'tier': 'BRONZE', 'threshold': 5},
                {'tier': 'GOLD', 'threshold': 20},
              ],
            },
          ],
        });

    const i18n = {
      'achievements': {
        'trophiesHeading': 'Trophies',
        'badgesHeading': 'Badges',
        'empty': 'None yet',
        'showcaseHeading': 'Showcase',
        'showcaseEmpty': 'Pin up to three',
        'showcaseEditHint': 'Pick three',
      },
      'common': {'edit': 'Edit', 'save': 'Save', 'share': 'Share'},
    };

    testWidgets('the owner sees a locked tile with its progress fraction', (tester) async {
      tester.view.physicalSize = const Size(1200, 3000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(host(
        const CabinetScreen(userId: 'u1', name: 'Jo'),
        i18n,
        [cabinetProvider('u1').overrideWith((ref) async => cabinet(owner: true))],
      ));
      await tester.pumpAndSettle();
      expect(find.text('2 / 5'), findsOneWidget);
      final bar = tester.widget<LinearProgressIndicator>(find.byType(LinearProgressIndicator));
      expect(bar.value, closeTo(0.4, 0.001));
    });

    testWidgets('a visitor sees neither locked tiles nor the edit affordances',
        (tester) async {
      tester.view.physicalSize = const Size(1200, 3000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(host(
        const CabinetScreen(userId: 'u1', name: 'Jo'),
        i18n,
        [cabinetProvider('u1').overrideWith((ref) async => cabinet(owner: false))],
      ));
      await tester.pumpAndSettle();
      expect(find.byType(LinearProgressIndicator), findsNothing);
      expect(find.text('Edit'), findsNothing);
      expect(find.byType(FloatingActionButton), findsNothing);
    });

    testWidgets('the showcase editor caps the selection at three pins', (tester) async {
      tester.view.physicalSize = const Size(1200, 3000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(host(
        const CabinetScreen(userId: 'u1', name: 'Jo'),
        i18n,
        [cabinetProvider('u1').overrideWith((ref) async => cabinet(owner: true, earned: 4))],
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Edit'));
      await tester.pumpAndSettle();

      for (var i = 0; i < 4; i++) {
        await tester.tap(find.byType(CheckboxListTile).at(i));
        await tester.pumpAndSettle();
      }
      final checked = tester
          .widgetList<CheckboxListTile>(find.byType(CheckboxListTile))
          .where((t) => t.value == true);
      expect(checked, hasLength(3));
    });
  });

  group('CompareScreen', () {
    LeaderboardResponse board() => LeaderboardResponse(rows: [
          LeaderboardResponseRow.fromJson(const {
            'rank': 1,
            'userId': 'me',
            'displayName': 'Me',
            'totalPoints': 10,
            'predictionPoints': 10,
            'championPoints': 0,
            'bestScorerPoints': 0,
            'livePoints': 0,
            'exactCount': 1,
            'outcomeCount': 1,
            'gdCount': 0,
            'showcase': [],
          }),
          LeaderboardResponseRow.fromJson(const {
            'rank': 2,
            'userId': 'them',
            'displayName': 'Rival',
            'totalPoints': 8,
            'predictionPoints': 8,
            'championPoints': 0,
            'bestScorerPoints': 0,
            'livePoints': 0,
            'exactCount': 0,
            'outcomeCount': 2,
            'gdCount': 0,
            'showcase': [],
          }),
        ]);

    testWidgets('the picked opponent survives a leaderboard refetch', (tester) async {
      await tester.pumpWidget(host(
        const CompareScreen(),
        const {
          'compare': {
            'title': 'Compare',
            'pickOpponent': 'Opponent',
            'noShared': 'No shared picks',
          },
        },
        [
          authOverride(),
          // A fresh response per read: the rows are new objects, as after a refetch.
          leaderboardProvider.overrideWith((ref) async => board()),
          headToHeadProvider(('me', 'them'))
              .overrideWith((ref) async => const <String, dynamic>{'hasData': false}),
        ],
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Rival').last);
      await tester.pumpAndSettle();
      expect(find.text('No shared picks'), findsOneWidget);

      ProviderScope.containerOf(tester.element(find.byType(CompareScreen)))
          .invalidate(leaderboardProvider);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('No shared picks'), findsOneWidget);
    });
  });

  group('AnalyticsScreen', () {
    AnalyticsResponse analytics({
      bool hasData = true,
      List<Map<String, Object?>> overrated = const [],
    }) =>
        AnalyticsResponse.fromJson({
          'competitionName': 'WC',
          'hasData': hasData,
          'totalPicks': 0,
          'totalPoints': 0,
          'avgPoints': 0,
          'tiers': {'exact': 0, 'diff': 0, 'outcome': 0, 'miss': 0},
          'accuracy': 0,
          'exactRate': 0,
          'goals': {'predictedAvg': 0, 'actualAvg': 0, 'lean': 0},
          'outcomeLean': {
            'predicted': {'home': 0, 'draw': 0, 'away': 0},
            'actual': {'home': 0, 'draw': 0, 'away': 0},
            'homeBiasPct': 0,
            'drawGapPct': 0,
          },
          'teams': {'overrated': overrated, 'underrated': const []},
          'overTime': const [],
          'streak': {'current': 0, 'best': 0},
          'fergieTime': {
            'matches': 0,
            'goals': 0,
            'netPoints': 0,
            'pointsWon': 0,
            'pointsLost': 0,
            'breakdown': const [],
          },
        });

    const i18n = {
      'analytics': {
        'title': 'Analytics',
        'signInHint': 'Sign in to see your analytics',
        'noTeamBias': 'Not enough picks per team yet',
        'overrated': 'Over-rated',
        'tierTitle': 'Tiers',
        'tier': {'exact': 'Exact', 'diff': 'Diff', 'outcome': 'Outcome', 'miss': 'Miss'},
      },
      'common': {'share': 'Share'},
    };

    testWidgets('no data shows the hint instead of empty cards', (tester) async {
      await tester.pumpWidget(host(
        const AnalyticsScreen(),
        i18n,
        [analyticsProvider.overrideWith((ref) async => analytics(hasData: false))],
      ));
      await tester.pumpAndSettle();
      expect(find.text('Sign in to see your analytics'), findsOneWidget);
    });

    testWidgets('all-zero tiers and no team bias render without dividing by zero',
        (tester) async {
      tester.view.physicalSize = const Size(1200, 4000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(host(
        const AnalyticsScreen(),
        i18n,
        [analyticsProvider.overrideWith((ref) async => analytics())],
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.text('Not enough picks per team yet'), findsOneWidget);
      final bars = tester.widgetList<LinearProgressIndicator>(find.byType(LinearProgressIndicator));
      expect(bars, isNotEmpty);
      expect(bars.every((b) => b.value == 0.0), isTrue);
    });
  });
}
