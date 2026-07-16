import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/app.dart';
import 'package:nostragoalus/api/token_store.dart';
import 'package:nostragoalus/i18n/i18n.dart';
import 'package:nostragoalus/state/providers.dart';
import 'package:nostragoalus/ui/sign_in_screen.dart';

import 'api/helpers.dart';

void main() {
  testWidgets('with no stored session the app shows the sign-in screen', (tester) async {
    // A ready I18n (no asset load) and an empty in-memory token store, so the
    // tree resolves without a spinner that would keep pumpAndSettle spinning.
    final i18n = I18n(
      const {
        'auth': {'signIn': 'Sign in', 'email': 'Email', 'password': 'Password'},
        'landing': {'title': 'Nostragoalus'},
      },
      const {},
      const Locale('en'),
    );

    await tester.pumpWidget(ProviderScope(
      overrides: [
        tokenStoreProvider.overrideWithValue(TokenStore(InMemoryKv())),
        i18nProvider.overrideWith((ref) => i18n),
      ],
      child: const NostragoalusApp(),
    ));
    // Let the auth controller's build() resolve to a signed-out state.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.byType(SignInScreen), findsOneWidget);
    expect(find.byIcon(Icons.translate), findsOneWidget);
  });
}
