import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';

import '../config.dart';
import '../state/providers.dart';

/// Path the SSO round trip comes back on. It is a **verified App Link /
/// Universal Link** on the server's own origin, not a private URL scheme: any
/// installed Android app can register `nostragoalus://` and receive a custom
/// scheme callback, while an autoVerify'd https link is claimed only by the app
/// whose signing certificate the domain publishes in
/// `/.well-known/assetlinks.json`.
///
/// The host comes from the API base, so a self-hosted or dev server round-trips
/// to itself. Verification only exists for https origins - a plain-http dev
/// server cannot complete this flow.
const ssoCallbackPath = '/mobile/sso-callback';

/// Where better-auth is told to land, which is NOT [ssoCallbackPath]. better-auth
/// ends an SSO sign-in by setting a session cookie and redirecting verbatim, so a
/// redirect straight to the App Link arrives with no credential and no code -
/// the app would intercept it, find no `code`, and fail every time. This server
/// route runs with that cookie, parks the bearer, and only then redirects to the
/// App Link with the single-use code appended.
const ssoParkPath = '/api/sso/mobile-callback';

/// The ONE query parameter the callback carries the exchange code in. It is
/// pinned, not probed: adopting whichever of several parameter names happens to
/// be present is how an attacker-chosen value gets used.
const ssoCodeParam = 'code';

/// CSRF/hijack guard: generated before the authorize URL is built, echoed back
/// by the callback, compared here.
const ssoStateParam = 'state';

/// base64url SHA-256 of [_verifier], sent through the redirect. The verifier
/// itself only ever travels in the exchange POST body, so someone who observes
/// the redirect holds a code they cannot spend.
const ssoChallengeParam = 'challenge';

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
  required Uri callback,
});

Future<String> _webAuth({required String url, required Uri callback}) =>
    FlutterWebAuth2.authenticate(
      url: url,
      callbackUrlScheme: callback.scheme,
      // Required whenever the callback scheme is https: the Auth Tab (Android)
      // and ASWebAuthenticationSession (iOS) need the exact host+path to
      // intercept, so the callback returns to us rather than loading a page.
      options: FlutterWebAuth2Options(httpsHost: callback.host, httpsPath: callback.path),
    );

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

  /// Run the browser SSO round-trip, trade the returned single-use code for the
  /// session bearer and adopt it. Returns false when the provider has no
  /// authorize URL; anything that completed but cannot be trusted throws
  /// [SsoException].
  Future<bool> signIn(String providerId) async {
    final state = _newNonce();
    final verifier = _newNonce();
    final challenge = _b64(sha256.convert(utf8.encode(verifier)).bytes);
    final callback = Uri.parse(AppConfig.apiBase).replace(path: ssoCallbackPath);
    // Relative, so better-auth resolves it against its own baseURL and no extra
    // trusted origin has to be configured for the app to sign in.
    final callbackUrl = Uri(
      path: ssoParkPath,
      queryParameters: {ssoStateParam: state, ssoChallengeParam: challenge},
    ).toString();

    final url = await _ref.read(apiProvider).ssoAuthorizeUrl(providerId, callbackUrl);
    if (url == null) return false;

    final result = await _browser(url: url, callback: callback);
    final params = Uri.parse(result).queryParameters;

    final error = params['error'];
    if (error != null) throw SsoException(error);
    // A callback that cannot echo our state did not come from the flow we
    // started, whichever app produced it.
    if (params[ssoStateParam] != state) throw const SsoException('state_mismatch');
    final code = params[ssoCodeParam];
    if (code == null || code.isEmpty) throw const SsoException('missing_code');

    final token =
        await _ref.read(apiProvider).ssoExchange(code: code, state: state, verifier: verifier);
    if (token == null || token.isEmpty) throw const SsoException('exchange_failed');

    await _ref.read(tokenStoreProvider).save(token);
    _ref.invalidate(authControllerProvider);
    return true;
  }

  String _newNonce() => _b64(List<int>.generate(32, (_) => _random.nextInt(256)));
}

/// Unpadded base64url. The `=` padding Dart emits is not in the character set
/// the server pins these values to (and Node's `base64url` digest omits it), so
/// a padded challenge would never match.
String _b64(List<int> bytes) => base64Url.encode(bytes).replaceAll('=', '');
