import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/i18n/i18n.dart';
import 'package:nostragoalus/i18n/i18n_scope.dart';
import 'package:nostragoalus/state/providers.dart';
import 'package:nostragoalus/ui/widgets/update_check_card.dart';

const _strings = {
  'appUpdate': {
    'section': 'This build',
    'thisBuild': 'Version',
    'devBuild': 'unreleased',
    'explainer': 'Never checks on its own.',
    'check': 'Check for a newer version',
    'checking': 'Asking...',
    'current': '{version} is the current build.',
    'newer': '{version} is out, {size}.',
    'sideloadNote': 'Cannot install it for you.',
    'unpublished': 'No build published.',
    'unversioned': 'Nothing to compare against.',
    'failed': 'Could not tell.',
    'download': 'Get the new version',
  },
};

Widget _host(List<Override> overrides) => ProviderScope(
      overrides: overrides,
      child: MaterialApp(
        home: I18nScope(
          i18n: I18n(_strings, const {}, const Locale('en')),
          child: const Scaffold(body: SingleChildScrollView(child: UpdateCheckCard())),
        ),
      ),
    );

Override _answer(UpdateCheck check) =>
    appReleaseProvider.overrideWith((ref) async => check);

void main() {
  // The whole point of the button: an unrequested check would be a nag, since
  // a sideloaded app cannot install its own update.
  testWidgets('asks nothing until the button is pressed', (tester) async {
    var calls = 0;
    await tester.pumpWidget(_host([
      appReleaseProvider.overrideWith((ref) async {
        calls++;
        return const UpdateCheck(UpdateState.current, version: '4.9.0');
      }),
    ]));
    await tester.pumpAndSettle();

    expect(find.text('Check for a newer version'), findsOneWidget);
    expect(calls, 0);

    await tester.tap(find.text('Check for a newer version'));
    await tester.pumpAndSettle();
    expect(calls, 1);
  });

  testWidgets('says so when this is the current build', (tester) async {
    await tester.pumpWidget(
        _host([_answer(const UpdateCheck(UpdateState.current, version: '4.9.0'))]));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Check for a newer version'));
    await tester.pumpAndSettle();

    expect(find.text('4.9.0 is the current build.'), findsOneWidget);
    expect(find.text('Get the new version'), findsNothing);
  });

  testWidgets('offers the download, with its size, when one is out', (tester) async {
    await tester.pumpWidget(_host([
      _answer(const UpdateCheck(UpdateState.newer, version: '4.10.0', sizeBytes: 94000000)),
    ]));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Check for a newer version'));
    await tester.pumpAndSettle();

    expect(find.text('4.10.0 is out, 89.6 MB.'), findsOneWidget);
    expect(find.text('Cannot install it for you.'), findsOneWidget);
    expect(find.text('Get the new version'), findsOneWidget);
  });

  testWidgets('a failed check blames the answer, not the build', (tester) async {
    await tester.pumpWidget(
        _host([appReleaseProvider.overrideWith((ref) async => throw Exception('offline'))]));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Check for a newer version'));
    await tester.pumpAndSettle();

    expect(find.text('Could not tell.'), findsOneWidget);
  });

  // A build made outside apk-publish has no release version, so "you are up to
  // date" would be a guess - and usually a wrong one, since a dev build is
  // normally ahead of the published one.
  testWidgets('an unstamped build is not compared', (tester) async {
    await tester.pumpWidget(_host([_answer(const UpdateCheck(UpdateState.unversioned))]));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Check for a newer version'));
    await tester.pumpAndSettle();

    expect(find.text('Nothing to compare against.'), findsOneWidget);
    expect(find.text('Get the new version'), findsNothing);
  });

  testWidgets('no published build is its own answer', (tester) async {
    await tester.pumpWidget(_host([_answer(const UpdateCheck(UpdateState.unpublished))]));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Check for a newer version'));
    await tester.pumpAndSettle();

    expect(find.text('No build published.'), findsOneWidget);
  });

  // The test binary carries no --dart-define=APP_VERSION.
  testWidgets('an unstamped build says so rather than showing "dev"', (tester) async {
    await tester.pumpWidget(_host([_answer(const UpdateCheck(UpdateState.unpublished))]));
    await tester.pumpAndSettle();

    expect(find.text('unreleased'), findsOneWidget);
  });
}
