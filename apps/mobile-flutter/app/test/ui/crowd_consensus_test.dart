import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/auth_repository.dart';
import 'package:nostragoalus/api/models.gen.dart';
import 'package:nostragoalus/i18n/i18n.dart';
import 'package:nostragoalus/i18n/i18n_scope.dart';
import 'package:nostragoalus/state/providers.dart';
import 'package:nostragoalus/ui/match/crowd_consensus.dart';

const _strings = {
  'crowd': {'title': 'Crowd consensus', 'count': '{n} predictions'},
  'leagues': {
    'global': 'Everyone',
    'crowdLeague': 'League',
    'crowdBonusHint': 'Bonus points always use everyone.',
  },
};

CrowdResponseTotal _total(int home, int away, int count) =>
    CrowdResponseTotal(home: home.toDouble(), away: away.toDouble(), count: count.toDouble());

class _Auth extends AuthController {
  @override
  Future<AuthUser?> build() async =>
      const AuthUser(id: 'me', email: 'me@example.com', showCrowd: true);
}

Widget _host({
  required Map<String, CrowdResponseTotal> global,
  Map<String, CrowdResponseTotal> league = const {},
  String? lens,
}) =>
    ProviderScope(
      overrides: [
        authControllerProvider.overrideWith(_Auth.new),
        crowdTotalsProvider.overrideWith((ref) async => global),
        leagueCrowdTotalsProvider.overrideWith((ref) async => league),
        selectedCompetitionProvider.overrideWith((ref) => 'wc26'),
        if (lens != null)
          leagueSelectionsProvider.overrideWith((ref) => {'wc26': lens}),
      ],
      child: MaterialApp(
        home: I18nScope(
          i18n: I18n(_strings, const {}, const Locale('en')),
          child: const Scaffold(
            body: CrowdConsensus(matchId: 'm1', homeTeam: 'FRA', awayTeam: 'BRA'),
          ),
        ),
      ),
    );

void main() {
  testWidgets('shows the everyone consensus with no lens', (tester) async {
    await tester.pumpWidget(_host(global: {'m1': _total(4, 2, 9)}));
    await tester.pumpAndSettle();

    expect(find.text('4 - 2'), findsOneWidget);
    expect(find.text('9 predictions'), findsOneWidget);
    expect(find.text('League'), findsNothing);
  });

  testWidgets('under the lens it leads with the league and keeps everyone beneath',
      (tester) async {
    await tester.pumpWidget(_host(
      global: {'m1': _total(4, 2, 9)},
      league: {'m1': _total(1, 3, 2)},
      lens: 'l1',
    ));
    await tester.pumpAndSettle();

    expect(find.text('1 - 3'), findsOneWidget);
    expect(find.text('2 predictions'), findsOneWidget);
    expect(find.text('League'), findsOneWidget);
    expect(find.text('Everyone'), findsOneWidget);
    expect(find.text('4 - 2'), findsOneWidget);
    expect(find.text('Bonus points always use everyone.'), findsOneWidget);
  });

  // count <= 0 is the server's anonymity-floor sentinel: a league too small to
  // report is not a 0-0 consensus.
  testWidgets('a league below the anonymity floor falls back to everyone',
      (tester) async {
    await tester.pumpWidget(_host(
      global: {'m1': _total(4, 2, 9)},
      league: {'m1': _total(0, 0, 0)},
      lens: 'l1',
    ));
    await tester.pumpAndSettle();

    expect(find.text('4 - 2'), findsOneWidget);
    expect(find.text('League'), findsNothing);
    expect(find.text('Bonus points always use everyone.'), findsNothing);
  });

  testWidgets('stays silent when nothing has a usable total', (tester) async {
    await tester.pumpWidget(_host(global: {'m1': _total(0, 0, 0)}));
    await tester.pumpAndSettle();

    expect(find.text('Crowd consensus'), findsNothing);
  });
}
