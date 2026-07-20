import 'dart:convert';
import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';

import '../state/providers.dart';

/// URL scheme the IdP redirect comes back on. Must be registered in the Android
/// manifest / iOS Info.plist and added to NUXT_SSO_TRUSTED_ORIGINS.
///
/// A private scheme is hijackable on Android: any installed app may register
/// `nostragoalus://` and receive the callback. The [ssoStateParam] round-trip
/// below is what stops a hijacked callback from being adopted; moving to a
/// verified App Link / Universal Link (https://goal.arzaroth.com/sso-callback)
/// is the real fix and needs a server-side change - see deferred-state.md.
const ssoScheme = 'nostragoalus';

/// The ONE query parameter the callback must carry the session token in. It is
/// pinned, not probed: adopting a bearer from whichever of several parameter
/// names happens to be present is how an attacker-chosen value gets saved.
const ssoTokenParam = 'token';

/// CSRF/hijack guard: generated before the authorize URL is built, echoed back
/// by the callback, compared here.
const ssoStateParam = 'state';

/// A completed-but-rejected SSO round trip. The sign-in screen already catches
/// it and shows `auth.ssoFailed`; [reason] is for logs, not for users.
class SsoException implements Exception {
  const SsoException(this.reason);
  final String reason;
  @override
  String toString() => 'SsoException: $reason';
}

class SsoProviderInfo {
  const SsoProviderInfo(this.providerId, this.name);
  final String providerId;
  final String name;
}

/// Opens the system browser tab for the IdP round trip. Injectable so the
/// callback handling is testable without a platform channel.
typedef SsoBrowser = Future<String> Function({
  required String url,
  required String callbackUrlScheme,
});

Future<String> _webAuth({required String url, required String callbackUrlScheme}) =>
    FlutterWebAuth2.authenticate(url: url, callbackUrlScheme: callbackUrlScheme);

final ssoServiceProvider = Provider<SsoService>((ref) => SsoService(ref));

class SsoService {
  SsoService(this._ref, {SsoBrowser? browser, Random? random})
      : _browser = browser ?? _webAuth,
        _random = random ?? Random.secure();

  final Ref _ref;
  final SsoBrowser _browser;
  final Random _random;

  /// Which SSO provider (if any) manages an email's domain.
  Future<SsoProviderInfo?> check(String email) async {
    final res = await _ref.read(apiProvider).ssoCheck(email);
    final id = res['providerId'] as String?;
    if (id == null) return null;
    return SsoProviderInfo(id, (res['name'] as String?) ?? id);
  }

  /// Run the browser SSO round-trip and adopt the returned bearer token.
  /// Returns false when the provider has no authorize URL; anything that
  /// completed but cannot be trusted throws [SsoException].
  Future<bool> signIn(String providerId) async {
    final state = _newState();
    final callback = Uri.parse('$ssoScheme://sso-callback')
        .replace(queryParameters: {ssoStateParam: state})
        .toString();
    final url = await _ref.read(apiProvider).ssoAuthorizeUrl(providerId, callback);
    if (url == null) return false;

    final result = await _browser(url: url, callbackUrlScheme: ssoScheme);
    final params = Uri.parse(result).queryParameters;

    final error = params['error'];
    if (error != null) throw SsoException(error);
    // A callback that cannot echo our state did not come from the flow we
    // started, whichever app produced it.
    if (params[ssoStateParam] != state) throw const SsoException('state_mismatch');
    final token = params[ssoTokenParam];
    if (token == null || token.isEmpty) throw const SsoException('missing_token');

    await _ref.read(tokenStoreProvider).save(token);
    _ref.invalidate(authControllerProvider);
    return true;
  }

  String _newState() =>
      base64Url.encode(List<int>.generate(32, (_) => _random.nextInt(256)));
}
