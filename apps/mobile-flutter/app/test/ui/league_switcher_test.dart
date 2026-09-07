import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/models.gen.dart';
import 'package:nostragoalus/i18n/i18n.dart';
import 'package:nostragoalus/i18n/i18n_scope.dart';
import 'package:nostragoalus/state/providers.dart';
import 'package:nostragoalus/ui/league_switcher.dart';

import 'league_fixtures.dart';

void main() {
  Widget host(ProviderContainer container) => UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          home: I18nScope(
            i18n: I18n(leagueStrings, const {}, const Locale('en')),
            child: const Scaffold(body: LeagueSwitcher()),
          ),
        ),
      );

  ProviderContainer containerWith(List<LeaguesResponseLeague> leagues) {
    final c = ProviderContainer(overrides: [
      leaguesOverride(leagues),
      selectedCompetitionProvider.overrideWith((ref) => 'wc26'),
    ]);
    addTearDown(c.dispose);
    return c;
  }

  testWidgets('stays hidden while the user is in no league', (tester) async {
    await tester.pumpWidget(host(containerWith(const [])));
    await tester.pumpAndSettle();

    expect(find.byType(PopupMenuButton<String>), findsNothing);
  });

  testWidgets('picking a league points the lens at it', (tester) async {
    final container = containerWith([leagueFixture('l1', 'Office')]);
    await tester.pumpWidget(host(container));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(PopupMenuButton<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(CheckedPopupMenuItem<String>, 'Office'));
    await tester.pumpAndSettle();

    expect(container.read(selectedLeagueIdProvider), 'l1');
  });

  // The everyone entry cannot carry null: PopupMenuButton reads a null result
  // as a dismissal and never calls onSelected.
  testWidgets('picking Everyone clears the lens', (tester) async {
    final container = containerWith([leagueFixture('l1', 'Office')]);
    container.read(leagueSelectionsProvider.notifier).state = const {'wc26': 'l1'};
    await tester.pumpWidget(host(container));
    await tester.pumpAndSettle();

    await tester.tap(find.byType(PopupMenuButton<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(CheckedPopupMenuItem<String>, 'Everyone'));
    await tester.pumpAndSettle();

    expect(container.read(selectedLeagueIdProvider), isNull);
  });
}
