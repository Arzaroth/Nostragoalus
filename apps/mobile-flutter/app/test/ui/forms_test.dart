import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dio/dio.dart';
import 'package:nostragoalus/api/auth_repository.dart';
import 'package:nostragoalus/api/models.gen.dart';
import 'package:nostragoalus/auth/sso.dart';
import 'package:nostragoalus/i18n/i18n.dart';
import 'package:nostragoalus/i18n/i18n_scope.dart';
import 'package:nostragoalus/state/providers.dart';
import 'package:nostragoalus/ui/create_league_screen.dart';
import 'package:nostragoalus/ui/forgot_password_screen.dart';
import 'package:nostragoalus/ui/league_settings_screen.dart';
import 'package:nostragoalus/ui/sign_in_screen.dart';
import 'package:nostragoalus/ui/signup_screen.dart';

/// Signed-out auth, so no keystore or network is touched by a form screen.
class _SignedOutAuth extends AuthController {
  @override
  Future<AuthUser?> build() async => null;
}

Widget _host(Widget child, Map<String, dynamic> i18nMap, [List<Override> overrides = const []]) {
  final i18n = I18n(i18nMap, const {}, const Locale('en'));
  return ProviderScope(
    overrides: [authControllerProvider.overrideWith(_SignedOutAuth.new), ...overrides],
    child: I18nScope(i18n: i18n, child: MaterialApp(home: child)),
  );
}

const _authStrings = {
  'landing': {'title': 'Nostragoalus'},
  'auth': {
    'signIn': 'Sign in',
    'signUp': 'Create account',
    'email': 'Email',
    'password': 'Password',
    'displayName': 'Display name',
    'emailInvalid': 'Enter a valid email address.',
    'passwordRequired': 'Enter your password.',
    'passwordTooShort': 'Use at least 8 characters.',
    'nameRequired': 'Enter a display name.',
    'forgot': 'Forgot?',
    'needAccount': 'Need an account?',
    'resetTitle': 'Reset password',
    'resetHint': 'Enter your email.',
    'resetSend': 'Send',
    'resetSent': 'Sent',
    'ssoDomainUse': 'Sign in with {name}',
    'or': 'or',
  },
  'err': {
    'signInFailed': 'Sign in failed',
    'offline': 'Cannot reach the server',
    'generic': 'Something went wrong',
  },
  'prefs': {'language': 'Language'},
};

/// An auth repository whose sign-in always fails with [error], so the screen's
/// error branch runs through the real AuthController rather than a stubbed state.
class _FailingAuth implements AuthRepository {
  _FailingAuth(this.error);
  final Object error;

  @override
  Future<AuthUser> signIn(String email, String password) async => throw error;

  @override
  Future<AuthUser?> currentUser() async => null;

  @override
  Future<void> signOut() async {}

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// Records the domain lookups a screen makes and answers with one provider.
class _FakeSso implements SsoService {
  _FakeSso(this.checked, {this.shouldFail});
  final List<String> checked;
  final bool Function()? shouldFail;

  @override
  Future<SsoProviderInfo?> check(String email) async {
    checked.add(email);
    if (shouldFail?.call() ?? false) throw Exception('lookup failed');
    return const SsoProviderInfo('idp', 'Axeo System');
  }

  @override
  Future<bool> signIn(String providerId) async => true;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  Future<void> failSignIn(WidgetTester tester, Object error) async {
    await tester.pumpWidget(_host(const SignInScreen(), _authStrings, [
      authRepositoryProvider.overrideWithValue(_FailingAuth(error)),
    ]));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'a@b.com');
    await tester.enterText(find.widgetWithText(TextFormField, 'Password'), 'hunter2hunter2');
    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pumpAndSettle();
  }

  testWidgets('a sign-in that never reached the server does not blame the password',
      (tester) async {
    await failSignIn(
      tester,
      DioException.connectionError(
        requestOptions: RequestOptions(path: '/api/auth/sign-in/email'),
        reason: 'unreachable',
      ),
    );
    expect(find.text('Cannot reach the server'), findsOneWidget);
    expect(find.text('Sign in failed'), findsNothing);
  });

  testWidgets('a refused sign-in still says the credentials were wrong', (tester) async {
    await failSignIn(tester, ApiException(401, 'bad credentials'));
    expect(find.text('Sign in failed'), findsOneWidget);
    expect(find.text('Cannot reach the server'), findsNothing);
  });

  testWidgets('a lookup that fails is retried on the next blur', (tester) async {
    // An SSO-only user has no password to fall back on, so memoising a failed
    // lookup would leave them with no way in at all.
    final checked = <String>[];
    var failNext = true;
    await tester.pumpWidget(_host(const SignInScreen(), _authStrings, [
      ssoServiceProvider.overrideWith((ref) => _FakeSso(checked, shouldFail: () {
            final fail = failNext;
            failNext = false;
            return fail;
          })),
    ]));
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'someone@axxone.fr');
    await tester.tap(find.widgetWithText(TextFormField, 'Password'));
    await tester.pumpAndSettle();
    expect(find.text('Sign in with Axeo System'), findsNothing);

    await tester.tap(find.widgetWithText(TextFormField, 'Email'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(TextFormField, 'Password'));
    await tester.pumpAndSettle();
    expect(checked, ['someone@axxone.fr', 'someone@axxone.fr']);
    expect(find.text('Sign in with Axeo System'), findsOneWidget);
  });

  testWidgets('emptying the email takes the SSO button away with it', (tester) async {
    final checked = <String>[];
    await tester.pumpWidget(_host(const SignInScreen(), _authStrings, [
      ssoServiceProvider.overrideWith((ref) => _FakeSso(checked)),
    ]));
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'someone@axxone.fr');
    await tester.tap(find.widgetWithText(TextFormField, 'Password'));
    await tester.pumpAndSettle();
    expect(find.text('Sign in with Axeo System'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'someone');
    await tester.tap(find.widgetWithText(TextFormField, 'Password'));
    await tester.pumpAndSettle();
    expect(find.text('Sign in with Axeo System'), findsNothing);
  });

  testWidgets('leaving the email field offers the domain SSO provider', (tester) async {
    // Tapping from email straight into password is the ordinary way out of the
    // field, and it fires no editing-complete action - so the lookup has to hang
    // off focus or the button never appears for anyone who does that.
    final checked = <String>[];
    await tester.pumpWidget(_host(const SignInScreen(), _authStrings, [
      ssoServiceProvider.overrideWith((ref) => _FakeSso(checked)),
    ]));
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextFormField, 'Email'), 'someone@axxone.fr');
    await tester.tap(find.widgetWithText(TextFormField, 'Password'));
    await tester.pumpAndSettle();

    expect(checked, ['someone@axxone.fr']);
    expect(find.text('Sign in with Axeo System'), findsOneWidget);

    // Bouncing focus back and forth must not re-ask for the same address.
    await tester.tap(find.widgetWithText(TextFormField, 'Email'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(TextFormField, 'Password'));
    await tester.pumpAndSettle();
    expect(checked, ['someone@axxone.fr']);
  });

  testWidgets('SignInScreen shows real errors, not the field labels', (tester) async {
    await tester.pumpWidget(_host(const SignInScreen(), _authStrings));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
    await tester.pump();

    expect(find.text('Enter a valid email address.'), findsOneWidget);
    expect(find.text('Enter your password.'), findsOneWidget);
    // The label must not double as the error text.
    expect(find.text('Email'), findsOneWidget);
  });

  testWidgets('SignUpScreen validates all three fields', (tester) async {
    await tester.pumpWidget(_host(const SignUpScreen(), _authStrings));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(FilledButton, 'Create account'));
    await tester.pump();

    expect(find.text('Enter a display name.'), findsOneWidget);
    expect(find.text('Enter a valid email address.'), findsOneWidget);
    expect(find.text('Use at least 8 characters.'), findsOneWidget);
  });

  testWidgets('ForgotPasswordScreen rejects a non-email instead of doing nothing',
      (tester) async {
    await tester.pumpWidget(_host(const ForgotPasswordScreen(), _authStrings));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextFormField), 'not-an-email');
    await tester.tap(find.widgetWithText(FilledButton, 'Send'));
    await tester.pump();

    expect(find.text('Enter a valid email address.'), findsOneWidget);
    expect(find.text('Sent'), findsNothing);
  });

  testWidgets('CreateLeagueScreen refuses a two-character name', (tester) async {
    await tester.pumpWidget(_host(
      const CreateLeagueScreen(),
      const {
        'leagues': {
          'create': 'Create league',
          'name': 'League name',
          'visibility': 'Visibility',
          'mode': 'Mode',
          'nameTooShort': 'At least 3 characters.',
          'competitionRequired': 'Pick a competition.',
          'modeNormal': 'Normal',
          'modeEasy': 'Easy',
          'modeHard': 'Hard',
          'modeHardcore': 'Hardcore',
          'visibilityPrivateShort': 'Private',
          'visibilityPublicShort': 'Public',
        },
        'nav': {'competition': 'Competition'},
      },
      [
        competitionsProvider.overrideWith((ref) async => CompetitionsResponse.fromJson(const {
              'competitions': [
                {'id': 'c1', 'slug': 'wc26', 'name': 'World Cup', 'startsAt': null},
              ],
            })),
      ],
    ));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextFormField).first, 'ab');
    await tester.tap(find.widgetWithText(FilledButton, 'Create league'));
    await tester.pump();

    expect(find.text('At least 3 characters.'), findsOneWidget);
    expect(find.text('Pick a competition.'), findsOneWidget);
  });

  testWidgets('LeagueSettingsScreen surfaces a short rename instead of dropping it',
      (tester) async {
    final league = LeagueDetailResponseLeague.fromJson(const {
      'id': 'l1',
      'name': 'Aces',
      'visibility': 'PRIVATE',
      'mode': 'NORMAL',
      'role': 'OWNER',
      'memberCount': 2,
    });
    await tester.pumpWidget(_host(
      LeagueSettingsScreen(league: league),
      const {
        'leagues': {
          'settings': 'League settings',
          'name': 'League name',
          'visibility': 'Visibility',
          'mode': 'Mode',
          'lives': 'Lives',
          'description': 'Description',
          'featuredTeam': 'Featured team',
          'featuredTeamKeep': 'Leave unchanged',
          'noFeaturedTeam': 'None',
          'editPrizes': 'Edit prizes',
          'nameTooShort': 'At least 3 characters.',
          'modeNormal': 'Normal',
          'modeEasy': 'Easy',
          'modeHard': 'Hard',
          'modeHardcore': 'Hardcore',
          'visibilityPrivateShort': 'Private',
          'visibilityPublicShort': 'Public',
        },
        'common': {'save': 'Save'},
      },
      [teamsProvider.overrideWith((ref) async => TeamsResponse.fromJson(const {'teams': []}))],
    ));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextFormField).first, 'ab');
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    await tester.pump();

    expect(find.text('At least 3 characters.'), findsOneWidget);
  });

  testWidgets('the lives stepper is HARDCORE-only', (tester) async {
    final league = LeagueDetailResponseLeague.fromJson(const {
      'id': 'l1',
      'name': 'Aces',
      'visibility': 'PRIVATE',
      'mode': 'HARDCORE',
      'lives': 3,
      'role': 'OWNER',
      'memberCount': 2,
    });
    await tester.pumpWidget(_host(
      LeagueSettingsScreen(league: league),
      const {
        'leagues': {
          'settings': 'League settings',
          'name': 'League name',
          'visibility': 'Visibility',
          'mode': 'Mode',
          'lives': 'Lives',
          'description': 'Description',
          'featuredTeam': 'Featured team',
          'featuredTeamKeep': 'Leave unchanged',
          'noFeaturedTeam': 'None',
          'editPrizes': 'Edit prizes',
          'nameTooShort': 'short',
          'modeNormal': 'Normal',
          'modeEasy': 'Easy',
          'modeHard': 'Hard',
          'modeHardcore': 'Hardcore',
          'visibilityPrivateShort': 'Private',
          'visibilityPublicShort': 'Public',
        },
        'common': {'save': 'Save'},
      },
      [teamsProvider.overrideWith((ref) async => TeamsResponse.fromJson(const {'teams': []}))],
    ));
    await tester.pumpAndSettle();
    expect(find.text('Lives'), findsOneWidget);
  });
}
