import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:nostragoalus/app.dart';
import 'package:nostragoalus/config.dart';
import 'package:nostragoalus/deeplink/deep_links.dart';
import 'package:nostragoalus/ui/account_screen.dart';
import 'package:nostragoalus/ui/home_shell.dart';
import 'package:nostragoalus/ui/sign_in_screen.dart';

/// Account deletion through the real UI against the isolated e2e stack, which
/// sends mail (maildev), so the app takes the mail-confirmed path: request the
/// link in the app, then hand the mailed link to the app the way an App Link /
/// Universal Link would (the server completes it only for the account's own
/// session, which the app holds), and the account is gone.
/// Seeded by tool/seed_e2e.sh (the throwaway DELETE_EMAIL account).
///   flutter test integration_test/account_deletion_test.dart -d emulator-5554 \
///     --dart-define=API_BASE=http://10.0.2.2:3100 \
///     --dart-define=MAILDEV_BASE=http://10.0.2.2:1081
/// The OS link source, fed by the test instead of the platform channel.
class _Links implements AppLinks {
  final _controller = StreamController<Uri>.broadcast();
  void emit(Uri uri) => _controller.add(uri);
  @override
  Future<Uri?> getInitialLink() async => null;
  @override
  Stream<Uri> get uriLinkStream => _controller.stream;
  @override
  noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  const email = String.fromEnvironment('DELETE_EMAIL', defaultValue: 'delete-me@example.com');
  const password = String.fromEnvironment('DELETE_PASSWORD', defaultValue: 'Delete-Password123!');
  const maildev = String.fromEnvironment('MAILDEV_BASE', defaultValue: 'http://10.0.2.2:1081');

  Future<void> waitFor(WidgetTester tester, Finder f, String what) async {
    for (var i = 0; i < 60 && f.evaluate().isEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 500));
    }
    expect(f, findsWidgets, reason: 'timed out waiting for $what');
  }

  Future<void> skipOnboardingTour(WidgetTester tester) async {
    final dialog = find.byType(Dialog);
    for (var i = 0; i < 20 && dialog.evaluate().isEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 500));
    }
    if (dialog.evaluate().isEmpty) return;
    await tester.tap(find.descendant(of: dialog, matching: find.byType(TextButton)).first);
    for (var i = 0; i < 40 && dialog.evaluate().isNotEmpty; i++) {
      await tester.pump(const Duration(milliseconds: 500));
    }
  }

  final http = HttpClient();

  Future<(int, String)> request(String method, Uri url, {Object? body}) async {
    final req = await http.openUrl(method, url);
    req.followRedirects = false;
    if (body != null) {
      req.headers.contentType = ContentType.json;
      req.write(jsonEncode(body));
    }
    final res = await req.close();
    return (res.statusCode, await res.transform(utf8.decoder).join());
  }

  /// The deletion link from the newest mail to [to]. The server builds it on
  /// its own origin, which the device cannot reach, so it is re-pointed at
  /// API_BASE.
  Future<Uri> deletionLink(String to) async {
    for (var i = 0; i < 40; i++) {
      final (_, body) = await request('GET', Uri.parse('$maildev/email'));
      final mails = (jsonDecode(body) as List).cast<Map<String, dynamic>>().where((m) =>
          (m['to'] as List).any((t) => (t['address'] as String).toLowerCase() == to));
      final text = mails.isEmpty ? '' : '${mails.last['text'] ?? ''}\n${mails.last['html'] ?? ''}';
      final link = RegExp(r'''https?://[^\s"'<>]+delete-user/callback[^\s"'<>]*''').firstMatch(text);
      if (link != null) {
        final sent = Uri.parse(link.group(0)!.replaceAll('&amp;', '&'));
        final base = Uri.parse(AppConfig.apiBase);
        return sent.replace(scheme: base.scheme, host: base.host, port: base.port);
      }
      await Future<void>.delayed(const Duration(milliseconds: 500));
    }
    fail('no account-deletion mail to $to');
  }

  testWidgets('request deletion -> open the mailed link -> the account is gone', (tester) async {
    await request('DELETE', Uri.parse('$maildev/email/all'));

    final links = _Links();
    await tester.pumpWidget(ProviderScope(
      overrides: [appLinksProvider.overrideWithValue(links)],
      child: const NostragoalusApp(),
    ));
    await tester.pumpAndSettle();

    // 1. sign in as the throwaway account
    expect(find.byType(SignInScreen), findsOneWidget);
    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), email);
    await tester.enterText(fields.at(1), password);
    await tester.tap(find.byType(FilledButton));
    await waitFor(tester, find.byType(HomeShell), 'the home shell');
    await skipOnboardingTour(tester);

    // 2. account tab -> delete account -> send the confirmation mail
    await tester.tap(find.byIcon(Icons.person_outline).last);
    await waitFor(tester, find.byType(AccountScreen), 'the account tab');
    final row = find.byIcon(Icons.delete_forever_outlined);
    await tester.scrollUntilVisible(row, 300, scrollable: find.byType(Scrollable).first);
    // Just "visible" can still sit under the bottom navigation bar.
    await Scrollable.ensureVisible(tester.element(row), alignment: 0.5);
    await tester.pump(const Duration(milliseconds: 500));
    await tester.tap(row);
    await waitFor(tester, find.byKey(const ValueKey('delete-submit')), 'the delete screen');
    await tester.tap(find.byKey(const ValueKey('delete-submit')));
    await waitFor(tester, find.byKey(const ValueKey('delete-mail-sent')), 'the mail-sent state');

    // 3. nothing is deleted until the link is opened
    final signIn = Uri.parse('${AppConfig.apiBase}/api/auth/sign-in/email');
    expect((await request('POST', signIn, body: {'email': email, 'password': password})).$1, 200);

    // 4. a browser opened from the mail holds no session, and the server
    // refuses it: that is why the link has to come back to the app
    final link = await deletionLink(email);
    final (browser, _) = await request('GET', link);
    expect(browser, 404, reason: 'the callback now works without a session; the in-app path is moot');

    // 5. the link reaches the app, which confirms it with its own session and
    // signs out
    links.emit(link);
    await waitFor(tester, find.byType(SignInScreen), 'the sign-in screen after deletion');

    // 6. the account is gone: its credentials no longer sign in
    expect((await request('POST', signIn, body: {'email': email, 'password': password})).$1,
        isNot(200));
  });
}
