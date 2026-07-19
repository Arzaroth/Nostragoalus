import 'package:dio/dio.dart';

import 'api_client.dart';
import 'token_store.dart';

/// The signed-in user, from better-auth's session payload. Better-auth's
/// endpoints are outside the zod OpenAPI snapshot, so this is hand-modelled to
/// the fields the client actually reads.
class AuthUser {
  const AuthUser({
    required this.id,
    required this.email,
    this.name,
    this.image,
    this.role,
    this.skin,
    this.theme,
    this.showCrowd,
    this.showOdds,
  });

  final String id;
  final String email;
  final String? name;
  final String? image;
  final String? role;
  final String? skin; // active konami skin (twilight/rainbow/...)
  final String? theme; // 'light' | 'dark' | null (system)
  final bool? showCrowd;
  final bool? showOdds;

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        id: json['id'] as String,
        email: json['email'] as String,
        name: json['name'] as String?,
        image: json['image'] as String?,
        role: json['role'] as String?,
        skin: json['skin'] as String?,
        theme: json['theme'] as String?,
        showCrowd: json['showCrowd'] as bool?,
        showOdds: json['showOdds'] as bool?,
      );
}

/// Email/password auth over the bearer contract. Sign-in surfaces the token in
/// the `set-auth-token` header (captured by [ApiClient]); every later call reads
/// it from the [TokenStore].
class AuthRepository {
  AuthRepository(this._api, this._tokens);

  final ApiClient _api;
  final TokenStore _tokens;

  Future<AuthUser> signIn(String email, String password) async {
    final res = await _api.raw((dio) => dio.post<dynamic>(
          '/api/auth/sign-in/email',
          data: {'email': email, 'password': password},
          options: Options(validateStatus: (_) => true),
        ));
    final code = res.statusCode ?? 0;
    if (code != 200) {
      throw ApiException(code, 'sign-in failed', res.data);
    }
    // The interceptor persisted the token from set-auth-token; confirm it landed.
    if (_tokens.token == null) {
      throw ApiException(200, 'sign-in returned no bearer token');
    }
    final user = (res.data as Map<String, dynamic>)['user'];
    if (user is Map<String, dynamic>) return AuthUser.fromJson(user);
    // Some flows return only the token; fall back to a session fetch.
    final session = await currentUser();
    if (session != null) return session;
    throw ApiException(200, 'sign-in succeeded but no user payload');
  }

  /// The current user, or null when there is no valid session.
  Future<AuthUser?> currentUser() async {
    if (_tokens.token == null) return null;
    final res = await _api.raw((dio) => dio.get<dynamic>(
          '/api/auth/get-session',
          options: Options(validateStatus: (_) => true),
        ));
    if (res.statusCode != 200 || res.data is! Map) return null;
    final user = (res.data as Map<String, dynamic>)['user'];
    return user is Map<String, dynamic> ? AuthUser.fromJson(user) : null;
  }

  Future<void> signOut() async {
    try {
      await _api.raw((dio) => dio.post<dynamic>(
            '/api/auth/sign-out',
            options: Options(validateStatus: (_) => true),
          ));
    } finally {
      await _tokens.clear();
    }
  }
}
