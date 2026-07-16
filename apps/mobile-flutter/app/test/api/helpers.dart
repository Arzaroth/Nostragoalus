import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:nostragoalus/api/token_store.dart';

/// In-memory [SecureKv] for tests - no platform keystore.
class InMemoryKv implements SecureKv {
  final Map<String, String> _m = {};
  @override
  Future<String?> read(String key) async => _m[key];
  @override
  Future<void> write(String key, String value) async => _m[key] = value;
  @override
  Future<void> delete(String key) async => _m.remove(key);
}

/// A canned reply for the fake adapter.
class Reply {
  Reply(this.status, this.body, {this.headers = const {}});
  final int status;
  final Object? body; // encoded as JSON
  final Map<String, String> headers;
}

/// Dio adapter that records each request and returns queued replies in order.
class FakeAdapter implements HttpClientAdapter {
  FakeAdapter(this._replies);
  final List<Reply> _replies;
  final List<RequestOptions> requests = [];
  int _i = 0;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    final r = _replies[_i < _replies.length ? _i : _replies.length - 1];
    _i++;
    return ResponseBody.fromString(
      jsonEncode(r.body),
      r.status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
        for (final e in r.headers.entries) e.key: [e.value],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}
