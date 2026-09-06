import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/token_store.dart';
import 'package:nostragoalus/i18n/i18n.dart';
import 'package:nostragoalus/i18n/i18n_scope.dart';
import 'package:nostragoalus/state/providers.dart';
import 'package:nostragoalus/ui/sessions_screen.dart';
import 'package:nostragoalus/ui/widgets/panel.dart';

class _MemoryKv implements SecureKv {
  _MemoryKv([this._value]);
  String? _value;
  @override
  Future<String?> read(String key) async => _value;
  @override
  Future<void> write(String key, String value) async => _value = value;
  @override
  Future<void> delete(String key) async => _value = null;
}

const _strings = {
  'sessions': {
    'title': 'Devices',
    'empty': 'No active sessions',
    'revoke': 'Sign out this device',
    'current': 'This device',
    'unknownDevice': 'Unknown device',
  },
  'err': {'generic': 'Something went wrong'},
  'common': {'retry': 'Retry'},
};

Future<Widget> _host(List<Override> overrides, {String? bearer}) async {
  final tokens = TokenStore(_MemoryKv(bearer));
  await tokens.load();
  return ProviderScope(
    overrides: [tokenStoreProvider.overrideWithValue(tokens), ...overrides],
    // The scope sits above MaterialApp (as in app.dart) so dialog routes,
    // which are siblings of home, still resolve it.
    child: I18nScope(
      i18n: I18n(_strings, const {}, const Locale('en')),
      child: const MaterialApp(home: SessionsScreen()),
    ),
  );
}

void main() {
  testWidgets('labels this device and sorts it first', (tester) async {
    await tester.pumpWidget(await _host(
      [
        sessionsProvider.overrideWith((ref) async => [
              {'token': 'other', 'userAgent': 'Pixel 8'},
              {'token': 'mine', 'userAgent': 'Laptop'},
            ]),
      ],
      bearer: 'mine',
    ));
    await tester.pumpAndSettle();

    expect(find.text('Laptop - This device'), findsOneWidget);
    expect(find.text('Pixel 8'), findsOneWidget);
    final rows = tester.widgetList<PanelRow>(find.byType(PanelRow)).toList();
    expect((rows.first.title as Text).data, 'Laptop - This device');
  });

  testWidgets('marks nothing when the bearer matches no row', (tester) async {
    await tester.pumpWidget(await _host(
      [
        sessionsProvider.overrideWith((ref) async => [
              {'token': 'other', 'userAgent': 'Pixel 8'},
            ]),
      ],
      bearer: 'mine',
    ));
    await tester.pumpAndSettle();
    expect(find.textContaining('This device'), findsNothing);
  });

  testWidgets('renders an error state with a retry when the list fails', (tester) async {
    await tester.pumpWidget(await _host(
      [sessionsProvider.overrideWith((ref) async => throw Exception('boom'))],
      bearer: 'mine',
    ));
    await tester.pumpAndSettle();

    expect(find.text('Something went wrong'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);
  });

  testWidgets('confirms before revoking', (tester) async {
    await tester.pumpWidget(await _host(
      [
        sessionsProvider.overrideWith((ref) async => [
              {'token': 'mine', 'userAgent': 'Laptop'},
            ]),
      ],
      bearer: 'mine',
    ));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.logout));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
  });
}
