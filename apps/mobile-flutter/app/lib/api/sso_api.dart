import 'api_client.dart';

/// Single sign-on: discovering an email's provider and trading the callback
/// code for a session bearer.
extension SsoApi on ApiClient {
  /// The SSO provider capturing an email's domain, if any ({providerId, name}).
  Future<Map<String, dynamic>> ssoCheck(String email) async =>
      getJson('/api/sso/check', query: {'email': email});

  /// Start a better-auth SSO sign-in; returns the IdP authorize URL to open.
  Future<String?> ssoAuthorizeUrl(String providerId, String callbackURL) async {
    final res = await postJson('/api/auth/sign-in/sso',
        body: {'providerId': providerId, 'callbackURL': callbackURL});
    return res['url'] as String?;
  }

  /// Trade the single-use code from the SSO callback for the session bearer.
  /// The verifier proves we are the client that started the flow, so the code
  /// is worthless to anyone who merely observed the redirect.
  Future<String?> ssoExchange({
    required String code,
    required String state,
    required String verifier,
  }) async {
    final res = await postJson('/api/sso/mobile-exchange',
        body: {'code': code, 'state': state, 'verifier': verifier});
    return res['token'] as String?;
  }
}
