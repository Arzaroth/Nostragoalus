import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/models.gen.dart';
import 'package:nostragoalus/i18n/i18n.dart';
import 'package:nostragoalus/i18n/i18n_scope.dart';
import 'package:nostragoalus/state/providers.dart';
import 'package:nostragoalus/ui/map_screen.dart';
import 'package:nostragoalus/ui/sessions_screen.dart';
import 'package:nostragoalus/ui/widgets/stat_tile.dart';

/// Wrap a widget with a ready I18n (the given flat map) + the given provider
/// overrides, so a screen renders without asset loads or a live API.
Widget _host(Widget child, Map<String, dynamic> i18nMap, List<Override> overrides) {
  final i18n = I18n(i18nMap, const {}, const Locale('en'));
  return ProviderScope(
    overrides: overrides,
    child: MaterialApp(home: I18nScope(i18n: i18n, child: child)),
  );
}

void main() {
  testWidgets('StatTile shows value, label and optional sub', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(body: StatTile(label: 'Points', value: '42', sub: 'best 9')),
    ));
    expect(find.text('42'), findsOneWidget);
    expect(find.text('Points'), findsOneWidget);
    expect(find.text('best 9'), findsOneWidget);
  });

  testWidgets('SessionsScreen lists a device with a revoke button', (tester) async {
    await tester.pumpWidget(_host(
      const SessionsScreen(),
      const {
        'sessions': {'title': 'Devices', 'empty': 'None', 'revoke': 'Revoke', 'unknownDevice': '?'},
      },
      [
        sessionsProvider.overrideWith((ref) async => [
              {'token': 't1', 'userAgent': 'Pixel 8', 'ipAddress': '10.0.0.1'},
            ]),
      ],
    ));
    await tester.pumpAndSettle();
    expect(find.text('Pixel 8'), findsOneWidget);
    expect(find.byIcon(Icons.logout), findsOneWidget);
  });

  testWidgets('SessionsScreen shows the empty state with no sessions', (tester) async {
    await tester.pumpWidget(_host(
      const SessionsScreen(),
      const {
        'sessions': {'title': 'Devices', 'empty': 'No active sessions', 'revoke': 'x', 'unknownDevice': '?'},
      },
      [sessionsProvider.overrideWith((ref) async => const [])],
    ));
    await tester.pumpAndSettle();
    expect(find.text('No active sessions'), findsOneWidget);
  });

  testWidgets('MapScreen sorts still-in first and strikes out eliminated', (tester) async {
    final teams = TeamsResponse.fromJson(const {
      'teams': [
        {'code': 'AAA', 'name': 'Alpha'},
        {'code': 'BBB', 'name': 'Bravo'},
      ],
    });
    await tester.pumpWidget(_host(
      const MapScreen(),
      const {
        'nav': {'map': 'Map'},
        'map': {'stillIn': '{n} teams still in', 'eliminated': 'Eliminated'},
      },
      [
        teamsProvider.overrideWith((ref) async => teams),
        eliminatedProvider.overrideWith((ref) async => const ['BBB']),
      ],
    ));
    await tester.pumpAndSettle();
    expect(find.text('1 teams still in'), findsOneWidget);
    expect(find.text('Eliminated'), findsOneWidget);
    expect(find.text('Alpha'), findsOneWidget);
    expect(find.text('Bravo'), findsOneWidget);
  });
}
