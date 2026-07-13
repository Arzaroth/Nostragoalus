import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../config.dart';

/// Phase 0 spike #1: prove better-auth **bearer** auth end to end -
/// sign in with email/password, persist the token, make an authenticated call.
///
/// Requires the `bearer()` plugin enabled server-side (apps/web-nuxt/lib/auth.ts):
/// on sign-in better-auth returns the session token in a `set-auth-token` response
/// header, and requests authenticate with `Authorization: Bearer <token>` instead
/// of the session cookie (which a native client can't carry cleanly).
class AuthProbe {
  final Dio _dio = Dio(BaseOptions(
    baseUrl: AppConfig.apiBase,
    validateStatus: (_) => true, // inspect non-2xx bodies instead of throwing
  ));
  final FlutterSecureStorage _store = const FlutterSecureStorage();
  static const _tokenKey = 'ng_bearer';

  Future<String> run(String email, String password) async {
    final out = StringBuffer()..writeln('API: ${AppConfig.apiBase}');

    // 1. Sign in. The bearer plugin surfaces the token in `set-auth-token`.
    final signIn = await _dio.post('/api/auth/sign-in/email',
        data: {'email': email, 'password': password});
    out.writeln('sign-in: HTTP ${signIn.statusCode}');
    if (signIn.statusCode != 200) {
      out.writeln('body: ${signIn.data}');
      return out.toString();
    }
    final token = signIn.headers.value('set-auth-token');
    if (token == null || token.isEmpty) {
      out.writeln('FAIL: no `set-auth-token` header - is the bearer() plugin enabled + deployed?');
      return out.toString();
    }
    await _store.write(key: _tokenKey, value: token);
    out.writeln('token stored in secure storage (${token.length} chars)');

    // 2. Authenticated request using the stored token (fresh Dio, no cookies).
    final stored = await _store.read(key: _tokenKey);
    final authed = await _dio.get('/api/me/trust-status',
        options: Options(headers: {'Authorization': 'Bearer $stored'}));
    out.writeln('authed GET /api/me/trust-status: HTTP ${authed.statusCode}');
    out.writeln(authed.statusCode == 200
        ? 'PASS - bearer auth works end to end'
        : 'FAIL: ${authed.data}');
    return out.toString();
  }
}
