import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:nostragoalus/app.dart';
import 'package:nostragoalus/ui/home_shell.dart';
import 'package:nostragoalus/ui/sign_in_screen.dart';

/// Phase 1 end-to-end on a device/emulator: sign in with real creds against a
/// live server, land on the home shell.
///   flutter test integration_test/sign_in_flow_test.dart -d emulator-5554 \
///     --dart-define=API_BASE=http://10.0.2.2:3001 \
///     --dart-define=PROBE_EMAIL=probe@example.com \
///     --dart-define=PROBE_PASSWORD='Probe-Password123!'
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  const email = String.fromEnvironment('PROBE_EMAIL');
  const password = String.fromEnvironment('PROBE_PASSWORD');

  testWidgets('sign in lands on the home shell', (tester) async {
    expect(email, isNotEmpty, reason: 'pass --dart-define=PROBE_EMAIL');

    await tester.pumpWidget(const ProviderScope(child: NostragoalusApp()));
    await tester.pumpAndSettle();

    expect(find.byType(SignInScreen), findsOneWidget);

    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), email);
    await tester.enterText(fields.at(1), password);
    await tester.pump();

    // Tap the sign-in button (the FilledButton in the form).
    await tester.tap(find.byType(FilledButton));
    await tester.pump();

    // Poll for the shell; the network round-trip + data reads take a moment.
    for (var i = 0; i < 40 && find.byType(HomeShell).evaluate().isEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 500));
    }
    expect(find.byType(HomeShell), findsOneWidget);
    expect(find.byType(NavigationBar), findsOneWidget);
  });
}
