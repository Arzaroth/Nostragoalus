import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/api_client.dart';
import 'package:nostragoalus/api/auth_repository.dart';
import 'package:nostragoalus/api/token_store.dart';

import 'helpers.dart';

(AuthRepository, TokenStore, FakeAdapter) build(List<Reply> replies) {
  final tokens = TokenStore(InMemoryKv());
  final adapter = FakeAdapter(replies);
  final api = ApiClient(tokens, dio: Dio()..httpClientAdapter = adapter);
  return (AuthRepository(api, tokens), tokens, adapter);
}

void main() {
  test('signIn stores the bearer token and returns the user', () async {
    final (repo, tokens, _) = build([
      Reply(200, {
        'user': {'id': 'u1', 'email': 'a@b.tld', 'name': 'A', 'role': 'user'},
      }, headers: {'set-auth-token': 'the-token'}),
    ]);

    final user = await repo.signIn('a@b.tld', 'pw');

    expect(user.id, 'u1');
    expect(user.email, 'a@b.tld');
    expect(tokens.token, 'the-token');
  });

  test('signIn throws ApiException on bad credentials', () async {
    final (repo, tokens, _) = build([Reply(401, {'error': 'INVALID'})]);

    await expectLater(
      repo.signIn('a@b.tld', 'wrong'),
      throwsA(isA<ApiException>().having((e) => e.status, 'status', 401)),
    );
    expect(tokens.token, isNull);
  });

  test('currentUser returns null without a token (no request made)', () async {
    final (repo, _, adapter) = build([Reply(200, {})]);

    expect(await repo.currentUser(), isNull);
    expect(adapter.requests, isEmpty);
  });

  test('currentUser fetches the session when a token is present', () async {
    final (repo, tokens, _) = build([
      Reply(200, {
        'user': {'id': 'u2', 'email': 'c@d.tld'},
      }),
    ]);
    await tokens.save('t');

    final user = await repo.currentUser();
    expect(user?.id, 'u2');
  });

  test('signOut clears the token even if the call fails', () async {
    final (repo, tokens, _) = build([Reply(500, {'error': 'boom'})]);
    await tokens.save('t');

    await repo.signOut();
    expect(tokens.token, isNull);
  });

  test('signOut posts to the sign-out route and clears the token', () async {
    final (repo, tokens, adapter) = build([Reply(200, {'success': true})]);
    await tokens.save('t');

    await repo.signOut();

    expect(adapter.requests.single.method, 'POST');
    expect(adapter.requests.single.path, '/api/auth/sign-out');
    expect(tokens.token, isNull);
  });

  // A 200 with no set-auth-token header leaves nothing to authenticate later
  // calls with; that must not read as a successful sign-in.
  test('signIn rejects a 200 that carried no bearer token', () async {
    final (repo, tokens, _) = build([
      Reply(200, {
        'user': {'id': 'u1', 'email': 'a@b.tld'},
      }),
    ]);

    await expectLater(repo.signIn('a@b.tld', 'pw'), throwsA(isA<ApiException>()));
    expect(tokens.token, isNull);
  });

  test('signIn falls back to a session fetch when the body has no user', () async {
    final (repo, _, adapter) = build([
      Reply(200, {'token': 'the-token'}, headers: {'set-auth-token': 'the-token'}),
      Reply(200, {
        'user': {'id': 'u3', 'email': 'e@f.tld', 'emailVerified': true},
      }),
    ]);

    final user = await repo.signIn('e@f.tld', 'pw');

    expect(user.id, 'u3');
    expect(user.emailVerified, isTrue);
    expect(adapter.requests.map((r) => r.path),
        ['/api/auth/sign-in/email', '/api/auth/get-session']);
  });

  test('signIn throws when neither the body nor the session has a user', () async {
    final (repo, _, _) = build([
      Reply(200, {'token': 'the-token'}, headers: {'set-auth-token': 'the-token'}),
      Reply(200, {'user': null}),
    ]);

    await expectLater(
      repo.signIn('e@f.tld', 'pw'),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', contains('no user'))),
    );
  });

  test('currentUser is null when the session call fails', () async {
    final (repo, tokens, _) = build([Reply(500, {'error': 'down'})]);
    await tokens.save('stale');

    expect(await repo.currentUser(), isNull);
  });

  test('AuthUser reads the preference fields off the session', () async {
    final (repo, tokens, _) = build([
      Reply(200, {
        'user': {
          'id': 'u4',
          'email': 'g@h.tld',
          'name': 'G',
          'image': 'i.png',
          'role': 'admin',
          'skin': 'rainbow',
          'theme': 'dark',
          'showCrowd': true,
          'showOdds': false,
          'twoFactorEnabled': true,
          'onboardingTourDismissedAt': '2026-01-01T00:00:00.000Z',
          'emailVerified': true,
        },
      }),
    ]);
    await tokens.save('t');

    final user = await repo.currentUser();

    expect(user!.role, 'admin');
    expect(user.skin, 'rainbow');
    expect(user.theme, 'dark');
    expect(user.showCrowd, isTrue);
    expect(user.showOdds, isFalse);
    expect(user.twoFactorEnabled, isTrue);
    expect(user.onboardingTourDismissedAt, '2026-01-01T00:00:00.000Z');
    expect(user.image, 'i.png');
  });

  test('signUp posts the name, email and password', () async {
    final (repo, _, adapter) = build([
      Reply(200, {
        'user': {'id': 'u5', 'email': 'i@j.tld'},
      }),
    ]);

    await repo.signUp('New', 'i@j.tld', 'pw');

    expect(adapter.requests.single.method, 'POST');
    expect(adapter.requests.single.path, '/api/auth/sign-up/email');
    expect(adapter.requests.single.data,
        {'name': 'New', 'email': 'i@j.tld', 'password': 'pw'});
  });

  test('signUp surfaces a taken email with the server body', () async {
    final (repo, _, _) = build([Reply(422, {'code': 'USER_ALREADY_EXISTS'})]);

    await expectLater(
      repo.signUp('New', 'i@j.tld', 'pw'),
      throwsA(isA<ApiException>()
          .having((e) => e.status, 'status', 422)
          .having((e) => e.body, 'body', {'code': 'USER_ALREADY_EXISTS'})),
    );
  });

  test('requestPasswordReset pins the redirect target', () async {
    final (repo, _, adapter) = build([Reply(200, {'status': true})]);

    await repo.requestPasswordReset('k@l.tld');

    expect(adapter.requests.single.method, 'POST');
    expect(adapter.requests.single.path, '/api/auth/request-password-reset');
    expect(adapter.requests.single.data,
        {'email': 'k@l.tld', 'redirectTo': '/reset-password'});
  });

  test('requestPasswordReset surfaces a refusal', () async {
    final (repo, _, _) = build([Reply(429, {'error': 'slow down'})]);

    await expectLater(
      repo.requestPasswordReset('k@l.tld'),
      throwsA(isA<ApiException>().having((e) => e.status, 'status', 429)),
    );
  });
}
