import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/auth_repository.dart';
import 'package:nostragoalus/api/token_store.dart';
import 'package:nostragoalus/i18n/i18n.dart';
import 'package:nostragoalus/i18n/i18n_scope.dart';
import 'package:nostragoalus/state/providers.dart';
import 'package:nostragoalus/ui/delete_account_screen.dart';

import '../api/helpers.dart';

const _strings = {
  'account': {
    'deleteAccount': 'Delete account',
    'dangerTitle': 'Danger zone',
    'dangerHint': 'Irreversible.',
    'confirmDeleteHint': 'Enter your password.',
    'currentPassword': 'Current password',
    'deleteMailHint': 'A link will be mailed.',
    'deleteSendMail': 'Send confirmation mail',
    'deleteMailSent': 'Mail sent.',
    'deleteMailOpenHint': 'Open it on this phone.',
  },
  'twofa': {'disableCode': 'Current code'},
  'common': {'cancel': 'Cancel'},
  'err': {'generic': 'Something went wrong'},
};

class _Auth extends AuthController {
  _Auth(this._user, {this.deletes = true, this.error});
  final AuthUser _user;
  final bool deletes;
  final Object? error;
  final calls = <({DeletionPolicy policy, String? password, String? totpCode})>[];

  @override
  Future<AuthUser?> build() async => _user;

  @override
  Future<bool> deleteAccount(DeletionPolicy policy, {String? password, String? totpCode}) async {
    calls.add((policy: policy, password: password, totpCode: totpCode));
    if (error != null) throw error!;
    if (deletes) state = const AsyncData(null);
    return deletes;
  }
}

const _plain = AuthUser(id: 'u1', email: 'u1@example.com');
const _twoFactor = AuthUser(id: 'u1', email: 'u1@example.com', twoFactorEnabled: true);

Widget _host(_Auth auth, DeletionPolicy policy) => ProviderScope(
      overrides: [
        tokenStoreProvider.overrideWithValue(TokenStore(InMemoryKv())),
        authControllerProvider.overrideWith(() => auth),
        deletionPolicyProvider.overrideWith((ref) async => policy),
      ],
      child: I18nScope(
        i18n: I18n(_strings, const {}, const Locale('en')),
        child: MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () => Navigator.of(context)
                    .push(MaterialPageRoute(builder: (_) => const DeleteAccountScreen())),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    );

Future<void> _open(WidgetTester tester, _Auth auth, DeletionPolicy policy) async {
  await tester.pumpWidget(_host(auth, policy));
  await tester.pumpAndSettle();
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
}

FilledButton _submit(WidgetTester tester) =>
    tester.widget<FilledButton>(find.byKey(const ValueKey('delete-submit')));

void main() {
  testWidgets('with mail, sends the link without a password or a dialog', (tester) async {
    final auth = _Auth(_twoFactor, deletes: false);
    await _open(tester, auth, const DeletionPolicy(mailConfirmed: true, ssoManaged: false));

    expect(find.text('A link will be mailed.'), findsOneWidget);
    expect(find.byKey(const ValueKey('delete-password')), findsNothing);
    expect(find.byKey(const ValueKey('delete-code')), findsNothing,
        reason: 'the mailed link confirms a 2FA account too');

    await tester.tap(find.text('Send confirmation mail'));
    await tester.pumpAndSettle();

    expect(auth.calls.single.policy.mailConfirmed, isTrue);
    expect(find.text('Mail sent.'), findsOneWidget);
    expect(find.text('Open it on this phone.'), findsOneWidget,
        reason: 'the link needs this app or a signed-in browser, so say so');
    expect(find.byType(DeleteAccountScreen), findsOneWidget, reason: 'nothing is deleted yet');
  });

  testWidgets('without mail, needs the password and the code, confirms, then leaves', (tester) async {
    final auth = _Auth(_twoFactor);
    await _open(tester, auth, const DeletionPolicy(mailConfirmed: false, ssoManaged: false));

    expect(_submit(tester).onPressed, isNull);
    await tester.enterText(find.byKey(const ValueKey('delete-password')), 'pw');
    await tester.pump();
    expect(_submit(tester).onPressed, isNull, reason: '2FA is on, so the code is required too');
    await tester.enterText(find.byKey(const ValueKey('delete-code')), '123456');
    await tester.pump();

    await tester.tap(find.byKey(const ValueKey('delete-submit')));
    await tester.pumpAndSettle();
    expect(find.text('Irreversible.'), findsWidgets, reason: 'a confirmation dialog first');
    await tester.tap(find.widgetWithText(TextButton, 'Delete account'));
    await tester.pumpAndSettle();

    expect(auth.calls.single.password, 'pw');
    expect(auth.calls.single.totpCode, '123456');
    expect(find.byType(DeleteAccountScreen), findsNothing);
    expect(find.text('open'), findsOneWidget);
  });

  testWidgets('cancelling the dialog deletes nothing', (tester) async {
    final auth = _Auth(_plain);
    await _open(tester, auth, const DeletionPolicy(mailConfirmed: false, ssoManaged: false));

    expect(find.byKey(const ValueKey('delete-code')), findsNothing);
    await tester.enterText(find.byKey(const ValueKey('delete-password')), 'pw');
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('delete-submit')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();

    expect(auth.calls, isEmpty);
    expect(find.byType(DeleteAccountScreen), findsOneWidget);
  });

  testWidgets('an SSO account without mail confirms with no password field', (tester) async {
    final auth = _Auth(_plain);
    await _open(tester, auth, const DeletionPolicy(mailConfirmed: false, ssoManaged: true));

    expect(find.byKey(const ValueKey('delete-password')), findsNothing);
    expect(_submit(tester).onPressed, isNotNull);
    await tester.tap(find.byKey(const ValueKey('delete-submit')));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(TextButton, 'Delete account'));
    await tester.pumpAndSettle();

    expect(auth.calls.single.password, isNull);
  });

  testWidgets('shows the server reason and stays when the deletion is refused', (tester) async {
    final auth = _Auth(_plain, error: ApiException(400, 'HTTP 400', {'message': 'Invalid password'}));
    await _open(tester, auth, const DeletionPolicy(mailConfirmed: false, ssoManaged: false));

    await tester.enterText(find.byKey(const ValueKey('delete-password')), 'wrong');
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('delete-submit')));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(TextButton, 'Delete account'));
    await tester.pumpAndSettle();

    expect(find.text('Invalid password'), findsOneWidget);
    expect(find.byType(DeleteAccountScreen), findsOneWidget);
  });

  testWidgets('a policy that cannot be read says why', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        tokenStoreProvider.overrideWithValue(TokenStore(InMemoryKv())),
        authControllerProvider.overrideWith(() => _Auth(_plain)),
        deletionPolicyProvider.overrideWith(
            (ref) async => throw ApiException(503, 'HTTP 503', {'message': 'Down'})),
      ],
      child: I18nScope(
        i18n: I18n(_strings, const {}, const Locale('en')),
        child: const MaterialApp(home: DeleteAccountScreen()),
      ),
    ));
    await tester.pumpAndSettle();

    expect(find.text('Down'), findsOneWidget);
  });
}
