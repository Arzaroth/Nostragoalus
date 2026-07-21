import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/api.dart';
import 'package:nostragoalus/api/token_store.dart';

import 'helpers.dart';

/// An [ApiClient] wired to a [FakeAdapter] replaying [replies] in order.
(ApiClient, FakeAdapter) buildApi(List<Reply> replies) {
  final adapter = FakeAdapter(replies);
  final api = ApiClient(TokenStore(InMemoryKv()), dio: Dio()..httpClientAdapter = adapter);
  return (api, adapter);
}

/// A client whose every call fails with [status], for pinning the request a
/// reader sends without hand-building a whole response fixture.
(ApiClient, FakeAdapter) buildFailing([int status = 500]) =>
    buildApi([Reply(status, {'error': 'boom'})]);

Matcher throwsStatus(int status) =>
    throwsA(isA<ApiException>().having((e) => e.status, 'status', status));

/// Asserts the single recorded request's method, path and query.
void expectRequest(
  FakeAdapter adapter, {
  required String method,
  required String path,
  Map<String, dynamic> query = const {},
  Object? body,
}) {
  final req = adapter.requests.single;
  expect(req.method, method);
  expect(req.path, path);
  expect(req.queryParameters, query);
  if (body != null) expect(req.data, body);
}
