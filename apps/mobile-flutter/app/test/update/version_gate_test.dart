import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/auth_repository.dart';
import 'package:nostragoalus/api/token_store.dart';
import 'package:nostragoalus/app.dart';
import 'package:nostragoalus/deeplink/deep_links.dart' show navigatorKey;
import 'package:nostragoalus/i18n/i18n.dart';
import 'package:nostragoalus/state/providers.dart';
import 'package:nostragoalus/ui/sign_in_screen.dart';
import 'package:nostragoalus/ui/update_required_screen.dart';

import '../api/helpers.dart';

class _SignedOut extends AuthController {
  @override
  Future<AuthUser?> build() async => null;
}

Future<I18n> _i18n() => I18n.load(const Locale('en'),
    readAsset: (_) async => '{"auth":{"signIn":"Sign in"},'
        '"appUpdate":{"requiredTitle":"Time to update","requiredBody":"b",'
        '"requiredBodyMin":"Needs {version}","download":"Get it",'
        '"buildLine":"Version {version}","devBuild":"unreleased"}}');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  List<Override> overrides(ClientRefusal? refusal) => [
        tokenStoreProvider.overrideWithValue(TokenStore(InMemoryKv())),
        i18nProvider.overrideWith((ref) => _i18n()),
        authControllerProvider.overrideWith(_SignedOut.new),
        clientRefusalProvider.overrideWith((ref) => refusal),
      ];

  testWidgets('serves the app when the build is current', (tester) async {
    await tester.pumpWidget(
        ProviderScope(overrides: overrides(null), child: const NostragoalusApp()));
    await tester.pumpAndSettle();

    expect(find.byType(UpdateRequiredScreen), findsNothing);
    expect(find.byType(SignInScreen), findsOneWidget);
  });

  testWidgets('replaces the app once the server has refused the build', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: overrides(const ClientRefusal(minimum: '9.9.9')),
      child: const NostragoalusApp(),
    ));
    await tester.pumpAndSettle();

    expect(find.byType(UpdateRequiredScreen), findsOneWidget);
    expect(find.byType(SignInScreen), findsNothing);
    // The server's own number, not a hardcoded one.
    expect(find.text('Needs 9.9.9'), findsOneWidget);
  });

  // The gate wraps the Navigator rather than sitting inside it. As a route it
  // would render UNDER whatever the user had pushed, and they would go on
  // tapping through screens whose every request 426s.
  testWidgets('takes over even with a route pushed on top', (tester) async {
    final container = ProviderContainer(overrides: overrides(null));
    addTearDown(container.dispose);
    await tester.pumpWidget(UncontrolledProviderScope(
      container: container,
      child: const NostragoalusApp(),
    ));
    await tester.pumpAndSettle();

    navigatorKey.currentState!.push(MaterialPageRoute<void>(
      builder: (_) => const Scaffold(body: Text('a pushed screen')),
    ));
    await tester.pumpAndSettle();
    expect(find.text('a pushed screen'), findsOneWidget);

    container.read(clientRefusalProvider.notifier).state =
        const ClientRefusal(minimum: '9.9.9');
    await tester.pumpAndSettle();

    expect(find.byType(UpdateRequiredScreen), findsOneWidget);
    expect(find.text('a pushed screen'), findsNothing);
  });
}
