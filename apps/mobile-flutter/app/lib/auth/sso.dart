import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';

import '../state/providers.dart';

/// Custom URL scheme the IdP redirect comes back on. Must be registered in the
/// Android manifest / iOS Info.plist and added to NUXT_SSO_TRUSTED_ORIGINS.
const ssoScheme = 'nostragoalus';

class SsoProviderInfo {
  const SsoProviderInfo(this.providerId, this.name);
  final String providerId;
  final String name;
}

final ssoServiceProvider = Provider<SsoService>((ref) => SsoService(ref));

class SsoService {
  SsoService(this._ref);
  final Ref _ref;

  /// Which SSO provider (if any) manages an email's domain.
  Future<SsoProviderInfo?> check(String email) async {
    final res = await _ref.read(apiProvider).ssoCheck(email);
    final id = res['providerId'] as String?;
    if (id == null) return null;
    return SsoProviderInfo(id, (res['name'] as String?) ?? id);
  }

  /// Run the browser SSO round-trip and adopt the returned bearer token.
  /// Completing this needs the [ssoScheme] registered on the platform + trusted
  /// server-side; the token param name may vary by better-auth config.
  Future<bool> signIn(String providerId) async {
    final url = await _ref.read(apiProvider).ssoAuthorizeUrl(providerId, '$ssoScheme://sso-callback');
    if (url == null) return false;

    final result = await FlutterWebAuth2.authenticate(url: url, callbackUrlScheme: ssoScheme);
    final params = Uri.parse(result).queryParameters;
    final token = params['token'] ?? params['set-auth-token'] ?? params['session'];
    if (token == null || token.isEmpty) return false;

    await _ref.read(tokenStoreProvider).save(token);
    _ref.invalidate(authControllerProvider);
    return true;
  }
}
