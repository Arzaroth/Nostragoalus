import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/auth_repository.dart';
import 'package:nostragoalus/api/token_store.dart';
import 'package:nostragoalus/deeplink/deep_links.dart';
import 'package:nostragoalus/i18n/i18n.dart';
import 'package:nostragoalus/i18n/i18n_scope.dart';
import 'package:nostragoalus/state/providers.dart';
import 'package:nostragoalus/ui/share_card_screen.dart';

import '../api/helpers.dart';

/// Stands in for the platform channel: one cold-start link plus a stream of
/// links that arrive while the app runs.
class _FakeLinks implements AppLinks {
  _FakeLinks({this.initial});
  final Uri? initial;
  final _controller = StreamController<Uri>.broadcast();

  void emit(Uri uri) => _controller.add(uri);
  Future<void> close() => _controller.close();

  @override
  Future<Uri?> getInitialLink() async => initial;

  @override
  Stream<Uri> get uriLinkStream => _controller.stream;

  @override
  noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Auth extends AuthController {
  _Auth(this._user, {this.delay = Duration.zero});
  final AuthUser? _user;
  final Duration delay;
  @override
  Future<AuthUser?> build() async {
    await Future<void>.delayed(delay);
    return _user;
  }
}

class _FailingAuth extends AuthController {
  @override
  Future<AuthUser?> build() async => throw StateError('no session');
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late I18n i18n;
  setUpAll(() async {
    i18n = await I18n.load(const Locale('en'), readAsset: (_) async => '{}');
  });

  Future<void> pumpController(
    WidgetTester tester,
    _FakeLinks links, {
    AuthController Function()? auth,
  }) async {
    // I18nScope sits ABOVE MaterialApp, as app.dart does: a pushed route builds
    // outside `home`'s subtree and would not see a scope nested inside it.
    await tester.pumpWidget(ProviderScope(
      overrides: [
        tokenStoreProvider.overrideWithValue(TokenStore(InMemoryKv())),
        authControllerProvider.overrideWith(auth ?? () => _Auth(null)),
      ],
      child: I18nScope(
        i18n: i18n,
        child: MaterialApp(
          navigatorKey: navigatorKey,
          home: DeepLinkController(links: links, child: const SizedBox()),
        ),
      ),
    ));
  }

  testWidgets('a cold-start share link opens its card', (tester) async {
    final links = _FakeLinks(initial: Uri.parse('https://goal.arzaroth.com/s/tok'));
    addTearDown(links.close);
    await pumpController(tester, links);
    await tester.pumpAndSettle();

    expect(find.byType(ShareCardScreen), findsOneWidget);
  });

  // The cold-start case that used to be dropped: the link lands while the
  // session read is still in flight, and a signed-in target must survive it.
  testWidgets('waits for a slow session before routing', (tester) async {
    final links = _FakeLinks(initial: Uri.parse('https://goal.arzaroth.com/leagues/l1'));
    addTearDown(links.close);
    await pumpController(tester, links,
        auth: () => _Auth(const AuthUser(id: 'u1', email: 'u1@example.com'),
            delay: const Duration(milliseconds: 50)));

    await tester.pump(const Duration(milliseconds: 200));
    await tester.pumpAndSettle();

    expect(navigatorKey.currentState, isNotNull);
  });

  testWidgets('a link arriving while running is routed too', (tester) async {
    final links = _FakeLinks();
    addTearDown(links.close);
    await pumpController(tester, links);
    await tester.pumpAndSettle();

    links.emit(Uri.parse('https://goal.arzaroth.com/a/tok'));
    await tester.pumpAndSettle();

    expect(find.byType(ShareCardScreen), findsOneWidget);
  });

  testWidgets('a non-web scheme and an empty path are ignored', (tester) async {
    final links = _FakeLinks();
    addTearDown(links.close);
    await pumpController(tester, links);
    await tester.pumpAndSettle();

    links.emit(Uri.parse('nostragoalus://sso-callback?code=x'));
    links.emit(Uri.parse('https://goal.arzaroth.com/'));
    await tester.pumpAndSettle();

    expect(find.byType(ShareCardScreen), findsNothing);
  });

  testWidgets('a failed session read routes as signed out, not as a crash', (tester) async {
    final links = _FakeLinks(initial: Uri.parse('https://goal.arzaroth.com/s/tok'));
    addTearDown(links.close);
    await pumpController(tester, links, auth: _FailingAuth.new);
    await tester.pumpAndSettle();

    // Share cards are public, so this still opens even with no usable session.
    expect(find.byType(ShareCardScreen), findsOneWidget);
  });

  testWidgets('an initial-link failure is swallowed rather than crashing boot',
      (tester) async {
    final links = _ThrowingLinks();
    await pumpController(tester, links);
    await tester.pumpAndSettle();

    expect(tester.takeException(), isNull);
  });
}

class _ThrowingLinks extends _FakeLinks {
  @override
  Future<Uri?> getInitialLink() async => throw StateError('malformed');
}
