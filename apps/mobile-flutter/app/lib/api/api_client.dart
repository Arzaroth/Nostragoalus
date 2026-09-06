import 'package:dio/dio.dart';

import '../config.dart';
import 'token_store.dart';

/// The `?competition=` query for a competition-scoped read; null uses the
/// server default. Shared by every feature extension over [ApiClient].
Map<String, dynamic>? competitionQuery(String? competition) =>
    competition == null ? null : {'competition': competition};

/// True when the request never got an answer - DNS, refused, timed out, TLS.
/// `validateStatus` accepts every status, so Dio only throws for transport
/// failures; anything the server actually answered is an [ApiException]. The UI
/// needs the difference: "we could not reach the server" is not "your password
/// is wrong", and telling the user the latter sends them to reset a fine one.
bool isOfflineError(Object? error) => error is DioException;

/// Thrown for a non-2xx API response, carrying the status so callers (and the
/// auth layer) can branch on 401 without re-parsing Dio internals.
class ApiException implements Exception {
  ApiException(this.status, this.message, [this.body]);
  final int status;
  final String message;
  final Object? body;
  @override
  String toString() => 'ApiException($status): $message';
}

/// The app's single Dio client. Attaches the bearer token to every request and
/// captures a rotated token from any `set-auth-token` response header (better-auth
/// issues it on sign-in and refresh). A 401 clears the stored token so the app
/// falls back to signed-out.
class ApiClient {
  ApiClient(this._tokens, {Dio? dio, void Function()? onUnauthorized})
      : _dio = dio ?? Dio() {
    _dio.options
      ..baseUrl = AppConfig.apiBase
      ..connectTimeout = const Duration(seconds: 10)
      ..receiveTimeout = const Duration(seconds: 20)
      ..headers['content-type'] = 'application/json'
      // Inspect every response ourselves (throwing ApiException) rather than
      // letting Dio throw on non-2xx - one error type for all callers.
      ..validateStatus = (_) => true;
    _onUnauthorized = onUnauthorized;
    // A client can be rebuilt over a Dio that is shared for the process life
    // (the account flush makes a fresh one); without this the auth interceptor
    // would stack a copy per rebuild and run the 401 path once per copy.
    _dio.interceptors.clear();
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        final t = _tokens.token;
        if (t != null && t.isNotEmpty) {
          options.headers['Authorization'] = 'Bearer $t';
        }
        handler.next(options);
      },
      onResponse: (response, handler) async {
        await _captureToken(response.headers);
        // A 401 against a token we hold means the session died; drop it so the
        // app falls back to signed-out. (Not for anonymous calls, e.g. a bad
        // sign-in, where there was no token to invalidate.)
        if (response.statusCode == 401 && _tokens.token != null) {
          await _tokens.clear();
          _onUnauthorized?.call();
        }
        handler.next(response);
      },
    ));
  }

  final Dio _dio;
  final TokenStore _tokens;
  void Function()? _onUnauthorized;

  Future<void> _captureToken(Headers? headers) async {
    final t = headers?.value('set-auth-token');
    if (t != null && t.isNotEmpty && t != _tokens.token) {
      await _tokens.save(t);
    }
  }

  Future<Map<String, dynamic>> getJson(String path, {Map<String, dynamic>? query}) async {
    final r = await _dio.get<dynamic>(path, queryParameters: query);
    return _json(r);
  }

  Future<Map<String, dynamic>> postJson(String path, {Object? body}) async {
    final r = await _dio.post<dynamic>(path, data: body);
    return _json(r);
  }

  Future<Map<String, dynamic>> putJson(String path, {Object? body}) async {
    final r = await _dio.put<dynamic>(path, data: body);
    return _json(r);
  }

  Future<Map<String, dynamic>> deleteJson(String path, {Object? body}) async {
    final r = await _dio.delete<dynamic>(path, data: body);
    return _json(r);
  }

  /// A route whose 200 body is a top-level JSON array. Same status checking as
  /// [getJson]: an error body is never handed back as if it were data.
  Future<List<dynamic>> getList(String path, {Map<String, dynamic>? query}) async {
    final r = await _dio.get<dynamic>(path, queryParameters: query);
    _checkStatus(r);
    final data = r.data;
    if (data is List) return data;
    throw ApiException(
        r.statusCode ?? 0, 'expected a JSON array from ${r.requestOptions.path}', data);
  }

  void _checkStatus(Response<dynamic> r) {
    final code = r.statusCode ?? 0;
    if (code < 200 || code >= 300) {
      throw ApiException(code, 'HTTP $code for ${r.requestOptions.path}', r.data);
    }
  }

  Map<String, dynamic> _json(Response<dynamic> r) {
    _checkStatus(r);
    final data = r.data;
    if (data is Map<String, dynamic>) return data;
    throw ApiException(
        r.statusCode ?? 0, 'expected a JSON object from ${r.requestOptions.path}', data);
  }
}
