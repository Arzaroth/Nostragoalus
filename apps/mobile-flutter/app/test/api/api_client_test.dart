import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/api_client.dart';
import 'package:nostragoalus/api/token_store.dart';

import 'helpers.dart';

ApiClient _client(FakeAdapter adapter, TokenStore tokens, {void Function()? onUnauthorized}) {
  final dio = Dio()..httpClientAdapter = adapter;
  return ApiClient(tokens, dio: dio, onUnauthorized: onUnauthorized);
}

void main() {
  test('attaches the bearer token to outgoing requests', () async {
    final tokens = TokenStore(InMemoryKv());
    await tokens.save('tok-123');
    final adapter = FakeAdapter([Reply(200, {'ok': true})]);
    await _client(adapter, tokens).getJson('/api/matches');

    expect(adapter.requests.single.headers['Authorization'], 'Bearer tok-123');
  });

  test('omits the header when there is no token', () async {
    final tokens = TokenStore(InMemoryKv());
    final adapter = FakeAdapter([Reply(200, {'ok': true})]);
    await _client(adapter, tokens).getJson('/api/matches');

    expect(adapter.requests.single.headers.containsKey('Authorization'), isFalse);
  });

  test('captures a rotated token from set-auth-token', () async {
    final tokens = TokenStore(InMemoryKv());
    final adapter = FakeAdapter([
      Reply(200, {'ok': true}, headers: {'set-auth-token': 'fresh-tok'}),
    ]);
    await _client(adapter, tokens).getJson('/api/matches');

    expect(tokens.token, 'fresh-tok');
  });

  test('a 401 clears the token and calls onUnauthorized', () async {
    final tokens = TokenStore(InMemoryKv());
    await tokens.save('stale');
    var kicked = false;
    final adapter = FakeAdapter([Reply(401, {'error': 'unauthorized'})]);

    await expectLater(
      _client(adapter, tokens, onUnauthorized: () => kicked = true).getJson('/api/me'),
      throwsA(isA<ApiException>().having((e) => e.status, 'status', 401)),
    );
    expect(tokens.token, isNull);
    expect(kicked, isTrue);
  });

  test('a non-2xx that is not a 401 throws and keeps the token', () async {
    final tokens = TokenStore(InMemoryKv());
    await tokens.save('good');
    final adapter = FakeAdapter([Reply(500, {'error': 'boom'})]);

    await expectLater(
      _client(adapter, tokens).getJson('/api/matches'),
      throwsA(isA<ApiException>()
          .having((e) => e.status, 'status', 500)
          .having((e) => e.body, 'body', {'error': 'boom'})),
    );
    expect(tokens.token, 'good');
  });

  test('a 200 body that is not a JSON object throws', () async {
    final tokens = TokenStore(InMemoryKv());
    final adapter = FakeAdapter([Reply(200, [1, 2, 3])]);

    await expectLater(
      _client(adapter, tokens).getJson('/api/me/rewards'),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', contains('JSON object'))),
    );
  });

  test('getList rejects a body that is not a JSON array', () async {
    final tokens = TokenStore(InMemoryKv());
    final adapter = FakeAdapter([Reply(200, {'not': 'a list'})]);

    await expectLater(
      _client(adapter, tokens).getList('/api/me/rewards'),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', contains('JSON array'))),
    );
  });

  test('getList checks the status before the shape', () async {
    final tokens = TokenStore(InMemoryKv());
    final adapter = FakeAdapter([Reply(503, {'error': 'down'})]);

    await expectLater(
      _client(adapter, tokens).getList('/api/me/rewards'),
      throwsA(isA<ApiException>().having((e) => e.status, 'status', 503)),
    );
  });

  test('ApiException prints the status and message', () {
    expect(ApiException(404, 'nope').toString(), 'ApiException(404): nope');
  });

  test('competitionQuery is null without a competition', () {
    expect(competitionQuery(null), isNull);
    expect(competitionQuery('wc26'), {'competition': 'wc26'});
  });

  test('a 401 with no stored token keeps the anonymous caller as-is', () async {
    final tokens = TokenStore(InMemoryKv());
    var kicked = false;
    final adapter = FakeAdapter([Reply(401, {'error': 'INVALID_CREDENTIALS'})]);

    await expectLater(
      _client(adapter, tokens, onUnauthorized: () => kicked = true)
          .postJson('/api/auth/sign-in/email'),
      throwsA(isA<ApiException>().having((e) => e.status, 'status', 401)),
    );
    expect(kicked, isFalse);
  });

  test('a set-auth-token identical to the stored one is not re-saved', () async {
    final tokens = TokenStore(InMemoryKv());
    await tokens.save('same');
    final adapter = FakeAdapter([
      Reply(200, {'ok': true}, headers: {'set-auth-token': 'same'}),
    ]);

    await _client(adapter, tokens).getJson('/api/matches');
    expect(tokens.token, 'same');
  });

  test('putJson sends the body as a PUT', () async {
    final tokens = TokenStore(InMemoryKv());
    final adapter = FakeAdapter([Reply(200, {'ok': true})]);

    final res =
        await _client(adapter, tokens).putJson('/api/champion', body: {'teamCode': 'FRA'});

    expect(res, {'ok': true});
    expect(adapter.requests.single.method, 'PUT');
    expect(adapter.requests.single.data, {'teamCode': 'FRA'});
  });

  test('deleteJson sends the body as a DELETE', () async {
    final tokens = TokenStore(InMemoryKv());
    final adapter = FakeAdapter([Reply(200, {'ok': true})]);

    final res = await _client(adapter, tokens)
        .deleteJson('/api/leagues/lg/invites/i1', body: {'reason': 'stale'});

    expect(res, {'ok': true});
    expect(adapter.requests.single.method, 'DELETE');
    expect(adapter.requests.single.data, {'reason': 'stale'});
  });

  test('postJson returns the created object', () async {
    final tokens = TokenStore(InMemoryKv());
    final adapter = FakeAdapter([Reply(201, {'id': 'l1'})]);

    expect(await _client(adapter, tokens).postJson('/api/leagues', body: {'name': 'Mine'}),
        {'id': 'l1'});
  });

  test('getList returns the array on a 200', () async {
    final tokens = TokenStore(InMemoryKv());
    final adapter = FakeAdapter([
      Reply(200, [
        {'id': 'a'},
      ]),
    ]);

    expect(await _client(adapter, tokens).getList('/api/me/rewards'), hasLength(1));
  });
}
