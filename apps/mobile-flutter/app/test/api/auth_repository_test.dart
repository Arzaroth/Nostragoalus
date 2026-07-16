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
}
