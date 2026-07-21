import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/auth_repository.dart';
import 'package:nostragoalus/api/token_store.dart';
import 'package:nostragoalus/app.dart';
import 'package:nostragoalus/auth/sso.dart';
import 'package:nostragoalus/i18n/i18n.dart';
import 'package:nostragoalus/state/providers.dart';
import 'package:nostragoalus/ui/sign_in_screen.dart';

import 'package:dio/dio.dart';
import 'package:nostragoalus/api/api.dart';

import '../api/helpers.dart';

ApiClient clientWith(FakeAdapter adapter) =>
    ApiClient(TokenStore(InMemoryKv()), dio: Dio()..httpClientAdapter = adapter);

class _Auth extends AuthController {
  _Auth(this._user);
  final AuthUser? _user;
  @override
  Future<AuthUser?> build() async => _user;
}

class _FailingAuth extends AuthController {
  @override
  Future<AuthUser?> build() async => throw StateError('session read failed');
}

Future<I18n> _i18n() => I18n.load(const Locale('en'),
    readAsset: (_) async => '{"common":{"save":"Save"},"auth":{"signIn":"Sign in"}}');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  Widget app(List<Override> overrides) => ProviderScope(
        overrides: [
          tokenStoreProvider.overrideWithValue(TokenStore(InMemoryKv())),
          ...overrides,
        ],
        child: const NostragoalusApp(),
      );

  group('the app root', () {
    testWidgets('shows the bootstrap screen while the strings load', (tester) async {
      final never = Completer<I18n>();
      addTearDown(() => never.complete(_i18n()));
      await tester.pumpWidget(app([
        i18nProvider.overrideWith((ref) => never.future),
        authControllerProvider.overrideWith(() => _Auth(null)),
      ]));
      await tester.pump();

      expect(find.byType(CircularProgressIndicator), findsWidgets);
    });

    testWidgets('surfaces a strings failure instead of a blank screen', (tester) async {
      await tester.pumpWidget(app([
        i18nProvider.overrideWith((ref) async => throw StateError('locale bundle missing')),
        authControllerProvider.overrideWith(() => _Auth(null)),
      ]));
      await tester.pump();
      await tester.pump();

      expect(find.textContaining('locale bundle missing'), findsOneWidget);
    });

    testWidgets('signed out lands on sign in', (tester) async {
      await tester.pumpWidget(app([
        i18nProvider.overrideWith((ref) => _i18n()),
        authControllerProvider.overrideWith(() => _Auth(null)),
      ]));
      await tester.pumpAndSettle();

      expect(find.byType(SignInScreen), findsOneWidget);
    });

    testWidgets('an auth error falls back to sign in rather than trapping the user',
        (tester) async {
      await tester.pumpWidget(app([
        i18nProvider.overrideWith((ref) => _i18n()),
        authControllerProvider.overrideWith(_FailingAuth.new),
      ]));
      await tester.pumpAndSettle();

      expect(find.byType(SignInScreen), findsOneWidget);
    });
  });

  group('SSO domain capture', () {
    test('resolves the provider that owns an email domain', () async {
      final adapter = FakeAdapter([
        Reply(200, {'providerId': 'acme', 'name': 'Acme SSO'}),
      ]);
      final c = ProviderContainer(overrides: [
        tokenStoreProvider.overrideWithValue(TokenStore(InMemoryKv())),
        apiProvider.overrideWithValue(clientWith(adapter)),
      ]);
      addTearDown(c.dispose);

      final info = await c.read(ssoServiceProvider).check('someone@acme.test');
      expect(info!.providerId, 'acme');
      expect(info.name, 'Acme SSO');
    });

    test('falls back to the id when the provider has no display name', () async {
      final adapter = FakeAdapter([
        Reply(200, {'providerId': 'acme', 'name': null}),
      ]);
      final c = ProviderContainer(overrides: [
        tokenStoreProvider.overrideWithValue(TokenStore(InMemoryKv())),
        apiProvider.overrideWithValue(clientWith(adapter)),
      ]);
      addTearDown(c.dispose);

      expect((await c.read(ssoServiceProvider).check('a@acme.test'))!.name, 'acme');
    });

    test('a domain nobody owns resolves to no provider', () async {
      final adapter = FakeAdapter([
        Reply(200, {'providerId': null, 'name': null}),
      ]);
      final c = ProviderContainer(overrides: [
        tokenStoreProvider.overrideWithValue(TokenStore(InMemoryKv())),
        apiProvider.overrideWithValue(clientWith(adapter)),
      ]);
      addTearDown(c.dispose);

      expect(await c.read(ssoServiceProvider).check('a@gmail.test'), isNull);
    });
  });
}
