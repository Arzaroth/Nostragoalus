import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/models.gen.dart';
import 'package:nostragoalus/chat/dm_providers.dart';
import 'package:nostragoalus/i18n/i18n.dart';
import 'package:nostragoalus/i18n/i18n_scope.dart';
import 'package:nostragoalus/state/providers.dart';
import 'package:nostragoalus/ui/chat_rooms_screen.dart';
import 'package:nostragoalus/ui/home_shell.dart' show HomeTab;

import 'league_fixtures.dart';

Thread _thread(String id, String name, int unread) => Thread.fromJson({
      'threadId': id,
      'other': {'id': 'u-$id', 'name': name},
      'unread': unread,
    });

void main() {
  ProviderContainer containerWith(
    List<LeaguesResponseLeague> leagues,
    List<Thread> threads,
  ) {
    final c = ProviderContainer(overrides: [
      leaguesOverride(leagues),
      dmThreadsProvider.overrideWith((ref) async => DmThreadsResponse(threads: threads)),
    ]);
    addTearDown(c.dispose);
    return c;
  }

  Widget host(ProviderContainer container) => UncontrolledProviderScope(
        container: container,
        child: MaterialApp(
          home: I18nScope(
            i18n: I18n(leagueStrings, const {}, const Locale('en')),
            child: const ChatRoomsScreen(),
          ),
        ),
      );

  testWidgets('lists direct messages and one row per league', (tester) async {
    await tester.pumpWidget(host(containerWith(
      [leagueFixture('l1', 'Office'), leagueFixture('l2', 'Family')],
      const [],
    )));
    await tester.pumpAndSettle();

    expect(find.text('Messages'), findsOneWidget);
    expect(find.text('Office'), findsOneWidget);
    expect(find.text('Family'), findsOneWidget);
  });

  testWidgets('points at the leagues tab when there is nothing to talk in', (tester) async {
    final container = containerWith(const [], const []);
    await tester.pumpWidget(host(container));
    await tester.pumpAndSettle();

    expect(find.text('No leagues yet'), findsOneWidget);
    await tester.tap(find.widgetWithText(OutlinedButton, 'Leagues'));
    await tester.pump();

    expect(container.read(homeTabProvider), HomeTab.leagues);
  });

  testWidgets('badges the total unread direct messages', (tester) async {
    await tester.pumpWidget(host(containerWith(
      const [],
      [_thread('t1', 'Ana', 2), _thread('t2', 'Bo', 3)],
    )));
    await tester.pumpAndSettle();

    expect(find.text('5'), findsOneWidget);
  });

  testWidgets('shows no badge when everything is read', (tester) async {
    await tester.pumpWidget(host(containerWith(const [], [_thread('t1', 'Ana', 0)])));
    await tester.pumpAndSettle();

    expect(find.text('0'), findsNothing);
  });
}
