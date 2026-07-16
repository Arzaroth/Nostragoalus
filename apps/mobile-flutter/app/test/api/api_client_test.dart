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
}
