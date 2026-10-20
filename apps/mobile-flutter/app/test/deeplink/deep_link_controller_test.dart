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
  _Auth(this._user, {this.delay = Duration.zero, this.refuseDeletion = false});
  final AuthUser? _user;
  final Duration delay;
  final bool refuseDeletion;
  final confirmed = <String>[];
  @override
  Future<AuthUser?> build() async {
    await Future<void>.delayed(delay);
    return _user;
  }

  @override
  Future<void> confirmDeletion(String token) async {
    if (refuseDeletion) throw StateError('Failed to get user info');
    confirmed.add(token);
    state = const AsyncData(null);
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
          home: Scaffold(body: DeepLinkController(links: links, child: const SizedBox())),
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

  group('the mailed account-deletion link', () {
    const link = 'https://goal.arzaroth.com/api/auth/delete-user/callback?token=tok&callbackURL=%2Flogin';
    const signedIn = AuthUser(id: 'u1', email: 'u1@example.com');

    Future<void> confirmDeletion(WidgetTester tester) async {
      expect(find.text(i18n.t('account.dangerHint')), findsOneWidget, reason: 'asks before deleting');
      await tester.tap(find.widgetWithText(TextButton, i18n.t('account.deleteAccount')));
      await tester.pumpAndSettle();
    }

    test('is recognised by its exact path and needs a token', () {
      expect(deletionToken(Uri.parse(link)), 'tok');
      expect(deletionToken(Uri.parse('https://goal.arzaroth.com/api/auth/delete-user/callback')), isNull);
      expect(deletionToken(Uri.parse('https://goal.arzaroth.com/api/auth/delete-user/callback?token=')), isNull);
      expect(deletionToken(Uri.parse('https://goal.arzaroth.com/api/auth/delete-user?token=tok')), isNull);
      expect(deletionToken(Uri.parse('https://goal.arzaroth.com/leagues/l1?token=tok')), isNull);
    });

    testWidgets('is confirmed with this app\'s session after asking, and says the account is gone', (tester) async {
      final links = _FakeLinks();
      addTearDown(links.close);
      final auth = _Auth(signedIn);
      await pumpController(tester, links, auth: () => auth);
      await tester.pumpAndSettle();
      navigatorKey.currentState!.push(MaterialPageRoute<void>(
          builder: (_) => const Scaffold(body: Text('delete screen'))));
      await tester.pumpAndSettle();

      links.emit(Uri.parse(link));
      await tester.pumpAndSettle();
      await confirmDeletion(tester);

      expect(auth.confirmed, ['tok']);
      expect(find.text(i18n.t('account.deletedToast')), findsOneWidget);
      expect(find.text('delete screen'), findsNothing,
          reason: "the deleted account's screens must not cover sign-in");
    });

    testWidgets('cancelling the question deletes nothing', (tester) async {
      final links = _FakeLinks();
      addTearDown(links.close);
      final auth = _Auth(signedIn);
      await pumpController(tester, links, auth: () => auth);
      await tester.pumpAndSettle();

      links.emit(Uri.parse(link));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(TextButton, i18n.t('common.cancel')));
      await tester.pumpAndSettle();

      expect(auth.confirmed, isEmpty);
    });

    testWidgets('a refused link says to request a new one: the server spent it', (tester) async {
      final links = _FakeLinks();
      addTearDown(links.close);
      await pumpController(tester, links, auth: () => _Auth(signedIn, refuseDeletion: true));
      await tester.pumpAndSettle();

      links.emit(Uri.parse(link));
      await tester.pumpAndSettle();
      await confirmDeletion(tester);

      expect(find.text(i18n.t('account.deleteLinkFailed')), findsOneWidget);
    });

    testWidgets('signed out, the server is not called and the link is kept for after sign-in', (tester) async {
      final links = _FakeLinks();
      addTearDown(links.close);
      final auth = _Auth(null);
      await pumpController(tester, links, auth: () => auth);
      await tester.pumpAndSettle();

      links.emit(Uri.parse(link));
      await tester.pumpAndSettle();

      expect(auth.confirmed, isEmpty);
      expect(find.text(i18n.t('account.dangerHint')), findsNothing);
      expect(find.text(i18n.t('account.deleteLinkSignIn')), findsOneWidget);
    });

    testWidgets('the launch link replayed on the stream is acted on once', (tester) async {
      final links = _FakeLinks(initial: Uri.parse(link));
      addTearDown(links.close);
      final auth = _Auth(signedIn);
      await pumpController(tester, links, auth: () => auth);
      links.emit(Uri.parse(link));
      await tester.pumpAndSettle();

      expect(find.text(i18n.t('account.dangerHint')), findsOneWidget, reason: 'one question, not two');
      await confirmDeletion(tester);
      expect(auth.confirmed, ['tok']);
    });

    testWidgets('links can come from the provider, for on-device tests', (tester) async {
      final links = _FakeLinks();
      addTearDown(links.close);
      final auth = _Auth(signedIn);
      await tester.pumpWidget(ProviderScope(
        overrides: [
          tokenStoreProvider.overrideWithValue(TokenStore(InMemoryKv())),
          authControllerProvider.overrideWith(() => auth),
          appLinksProvider.overrideWithValue(links),
        ],
        child: I18nScope(
          i18n: i18n,
          child: MaterialApp(
            navigatorKey: navigatorKey,
            home: const Scaffold(body: DeepLinkController(child: SizedBox())),
          ),
        ),
      ));
      await tester.pumpAndSettle();

      links.emit(Uri.parse(link));
      await tester.pumpAndSettle();
      await confirmDeletion(tester);

      expect(auth.confirmed, ['tok']);
    });
  });
}

class _ThrowingLinks extends _FakeLinks {
  @override
  Future<Uri?> getInitialLink() async => throw StateError('malformed');
}
