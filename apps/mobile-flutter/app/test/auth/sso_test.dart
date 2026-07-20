import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/token_store.dart';
import 'package:nostragoalus/auth/sso.dart';
import 'package:nostragoalus/state/providers.dart';

import '../api/helpers.dart';
import '../chat/route_adapter.dart';

typedef Harness = ({SsoService sso, TokenStore tokens, List<String> callbacks});

void main() {
  /// Wires a service whose browser answers with [callback], computed from the
  /// callbackURL the app actually asked the server for (that is where the
  /// generated `state` lives).
  Harness build(String Function(Uri callbackUri) callback) {
    final callbacks = <String>[];
    final c = ProviderContainer(overrides: [
      dioProvider.overrideWithValue(Dio()..httpClientAdapter = _CapturingAdapter(callbacks)),
      tokenStoreProvider.overrideWithValue(TokenStore(InMemoryKv())),
      ssoServiceProvider.overrideWith((ref) => SsoService(
            ref,
            browser: ({required String url, required String callbackUrlScheme}) async =>
                callback(Uri.parse(callbacks.last)),
          )),
    ]);
    addTearDown(c.dispose);
    return (sso: c.read(ssoServiceProvider), tokens: c.read(tokenStoreProvider), callbacks: callbacks);
  }

  test('the callback must echo the state we generated', () async {
    final t = build((_) => '$ssoScheme://sso-callback?state=forged&token=stolen');
    await expectLater(t.sso.signIn('idp'), throwsA(isA<SsoException>()));
    expect(t.tokens.token, isNull, reason: 'a hijacked callback must not be adopted');
  });

  test('a matching state with the pinned token param signs in', () async {
    final t = build((cb) =>
        '$ssoScheme://sso-callback?state=${cb.queryParameters[ssoStateParam]}&$ssoTokenParam=good');
    expect(await t.sso.signIn('idp'), isTrue);
    expect(t.tokens.token, 'good');
  });

  test('no other parameter name is accepted as a bearer', () async {
    for (final name in const ['set-auth-token', 'session', 'access_token']) {
      final t = build((cb) =>
          '$ssoScheme://sso-callback?state=${cb.queryParameters[ssoStateParam]}&$name=x');
      await expectLater(t.sso.signIn('idp'), throwsA(isA<SsoException>()));
      expect(t.tokens.token, isNull);
    }
  });

  test('an error callback surfaces instead of failing silently', () async {
    final t = build((cb) =>
        '$ssoScheme://sso-callback?state=${cb.queryParameters[ssoStateParam]}&error=access_denied');
    await expectLater(
      t.sso.signIn('idp'),
      throwsA(isA<SsoException>().having((e) => e.reason, 'reason', 'access_denied')),
    );
  });

  test('each attempt generates a fresh state', () async {
    final t = build((cb) =>
        '$ssoScheme://sso-callback?state=${cb.queryParameters[ssoStateParam]}&$ssoTokenParam=good');
    await t.sso.signIn('idp');
    await t.sso.signIn('idp');
    final states =
        t.callbacks.map((c) => Uri.parse(c).queryParameters[ssoStateParam]).toSet();
    expect(states.length, 2);
  });
}

/// Answers `/api/auth/sign-in/sso` with an authorize URL and records the
/// callbackURL the app asked for.
class _CapturingAdapter extends RouteAdapter {
  _CapturingAdapter(this.callbacks)
      : super({
          '/api/auth/sign-in/sso': () => Reply(200, {'url': 'https://idp.example/authorize'}),
        });
  final List<String> callbacks;

  @override
  Future<ResponseBody> fetch(
      RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) {
    final body = options.data;
    if (body is Map && body['callbackURL'] is String) {
      callbacks.add(body['callbackURL'] as String);
    }
    return super.fetch(options, requestStream, cancelFuture);
  }
}
