import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:nostragoalus/app.dart';
import 'package:nostragoalus/ui/home_shell.dart';
import 'package:nostragoalus/ui/match/match_detail_screen.dart';
import 'package:nostragoalus/ui/match/prediction_editor.dart';
import 'package:nostragoalus/ui/sign_in_screen.dart';

/// The app's MAIN PATH, driven through the real UI on a device/emulator against
/// a live server - the mobile answer to the web's Playwright specs: sign in,
/// see the fixtures list, save a prediction, reopen the match and see it
/// persisted (the reopen re-reads the server, so a pick that only lived in
/// local widget state fails here).
///
/// The probe account must be a member of at least one league in the default
/// competition, or the editor renders `picks.noLeagueForCompetition` instead.
///   flutter test integration_test/main_path_test.dart -d emulator-5554 \
///     --dart-define=API_BASE=http://10.0.2.2:3001 \
///     --dart-define=PROBE_EMAIL=probe@example.com \
///     --dart-define=PROBE_PASSWORD='Probe-Password123!'
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  const email = String.fromEnvironment('PROBE_EMAIL');
  const password = String.fromEnvironment('PROBE_PASSWORD');

  /// pumpAndSettle cannot be used on screens with a live socket + spinners, so
  /// poll instead: pump until the finder hits or we give up.
  Future<void> waitFor(WidgetTester tester, Finder f, String what) async {
    for (var i = 0; i < 60 && f.evaluate().isEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 500));
    }
    expect(f, findsWidgets, reason: 'timed out waiting for $what');
  }

  /// The editor's first numeric Text is the home stepper's value (the ones
  /// before it are the section title, the league name and the team label).
  int homeGoals(WidgetTester tester) {
    final texts = find.descendant(
        of: find.byType(PredictionEditor), matching: find.byType(Text));
    for (final e in texts.evaluate()) {
      final n = int.tryParse((e.widget as Text).data ?? '');
      if (n != null) return n;
    }
    fail('no numeric stepper value in the prediction editor');
  }

  testWidgets('sign in -> fixtures -> save a prediction -> it persisted', (tester) async {
    expect(email, isNotEmpty, reason: 'pass --dart-define=PROBE_EMAIL');

    await tester.pumpWidget(const ProviderScope(child: NostragoalusApp()));
    await tester.pumpAndSettle();

    // 1. sign in
    expect(find.byType(SignInScreen), findsOneWidget);
    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), email);
    await tester.enterText(fields.at(1), password);
    await tester.tap(find.byType(FilledButton));
    await waitFor(tester, find.byType(HomeShell), 'the home shell');

    // 2. the fixtures list, and an unlocked match to pick on (the schedule icon
    // is the tile's not-locked marker)
    await waitFor(tester, find.byIcon(Icons.schedule), 'an unlocked fixture');
    await tester.tap(find.byIcon(Icons.schedule).first);
    await waitFor(tester, find.byType(MatchDetailScreen), 'the match detail');
    await waitFor(tester, find.byType(PredictionEditor), 'the prediction editor');

    // 3. bump the home score by one and save
    final steppers = find.byIcon(Icons.add_circle_outline);
    expect(steppers, findsWidgets, reason: 'the match is locked or has no league to pick in');
    final before = homeGoals(tester);
    await tester.tap(steppers.first);
    await tester.pump();
    await tester.tap(find.byIcon(Icons.save));
    await waitFor(tester, find.byType(SnackBar), 'the save confirmation');

    // 4. leave the match and reopen it: the value must come back from the server
    await tester.pageBack();
    await waitFor(tester, find.byType(HomeShell), 'the fixtures list again');
    await tester.tap(find.byIcon(Icons.schedule).first);
    await waitFor(tester, find.byType(PredictionEditor), 'the prediction editor again');
    expect(find.descendant(of: find.byType(PredictionEditor), matching: find.text('${before + 1}')),
        findsWidgets,
        reason: 'the saved prediction did not come back from the server');
  });
}
