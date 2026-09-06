import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/token_store.dart';
import 'package:nostragoalus/auth/sso.dart';
import 'package:nostragoalus/state/providers.dart';

import '../api/helpers.dart';
import '../chat/route_adapter.dart';

typedef Harness = ({
  SsoService sso,
  TokenStore tokens,
  List<Uri> callbacks,
  List<Map<String, dynamic>> exchanges,
});

void main() {
  /// Wires a service whose browser answers with [reply], computed from the
  /// callbackURL the app actually asked the server for (that is where the
  /// generated `state` and `challenge` live). The fake exchange endpoint hands
  /// back a bearer only for a well-formed, correctly bound redemption.
  Harness build(String Function(Uri callbackUri) reply) {
    final callbacks = <Uri>[];
    final exchanges = <Map<String, dynamic>>[];
    final container = ProviderContainer(overrides: [
      dioProvider.overrideWithValue(
          Dio()..httpClientAdapter = _SsoAdapter(callbacks, exchanges)),
      tokenStoreProvider.overrideWithValue(TokenStore(InMemoryKv())),
      ssoServiceProvider.overrideWith((ref) => SsoService(
            ref,
            browser: ({required String url, required Uri callback}) async {
              // The app opens the server's authorize route; everything the flow
              // is bound to rides in its query.
              callbacks.add(Uri.parse(url));
              return reply(callbacks.last);
            },
          )),
    ]);
    addTearDown(container.dispose);
    return (
      sso: container.read(ssoServiceProvider),
      tokens: container.read(tokenStoreProvider),
      callbacks: callbacks,
      exchanges: exchanges,
    );
  }

  test('every SSO path still exists on the server', () {
    // The two constants are the whole contract, and pinning them against each
    // other proves nothing - the tests would follow a typo. Nitro maps
    // server/api/<path>.get.ts onto /api/<path>, so the park route has to be a
    // real file, and the App Link has to match the constant the server redirects
    // to. Conflating or mistyping these is what broke mobile SSO twice.
    final repo = Directory.current.parent.parent.parent;
    final authorize = File('${repo.path}/apps/web-nuxt/server/api'
        '${ssoAuthorizePath.substring('/api'.length)}.get.ts');
    expect(authorize.existsSync(), isTrue,
        reason: 'no server route behind $ssoAuthorizePath (${authorize.path})');

    final service =
        File('${repo.path}/apps/web-nuxt/server/utils/sso/mobile-exchange.ts').readAsStringSync();
    expect(service, contains("MOBILE_SSO_CALLBACK_PATH = '$ssoCallbackPath'"),
        reason: 'the app intercepts a path the server does not redirect to');
  });

  test('the handshake starts in the browser, not on the app HTTP client', () async {
    // better-auth sets its CSRF state cookie on the sign-in response. Asking for
    // the authorize URL over the app's own client puts that cookie in the app,
    // and the callback then fails with "State not persisted correctly" - which is
    // exactly how this failed on a real device. So the app opens the server's
    // authorize route and lets the browser make that request.
    final t = build((cb) => 'https://goal.arzaroth.com$ssoCallbackPath'
        '?$ssoStateParam=${cb.queryParameters[ssoStateParam]}&$ssoCodeParam=the-code');
    await t.sso.signIn('idp');
    final opened = t.callbacks.single;
    expect(opened.path, ssoAuthorizePath);
    expect(opened.path, isNot(ssoCallbackPath));
    expect(opened.queryParameters[ssoProviderParam], 'idp');
    expect(opened.queryParameters[ssoChallengeParam], isNotNull,
        reason: 'the server binds the parked code to our challenge');
    expect(t.exchanges.single['code'], 'the-code');
  });

  test('signs in against a callback that behaves like the real server', () async {
    // Plays the server: a code comes back only because the browser went through
    // the authorize route, which is the only path that carries the state cookie.
    final t = build((opened) {
      if (opened.path != ssoAuthorizePath) {
        // Anything else lands on the App Link with nothing to redeem.
        return Uri.parse('https://goal.arzaroth.com')
            .replace(path: ssoCallbackPath, queryParameters: opened.queryParameters)
            .toString();
      }
      return Uri.parse('https://goal.arzaroth.com').replace(
        path: ssoCallbackPath,
        queryParameters: {
          ssoStateParam: opened.queryParameters[ssoStateParam],
          ssoCodeParam: 'the-code',
        },
      ).toString();
    });
    expect(await t.sso.signIn('idp'), isTrue);
    expect(t.tokens.token, 'bearer-from-exchange');
  });

  test('the callback must echo the state we generated', () async {
    final t = build((_) => 'https://goal.arzaroth.com$ssoCallbackPath?state=forged&code=stolen');
    await expectLater(t.sso.signIn('idp'), throwsA(isA<SsoException>()));
    expect(t.tokens.token, isNull, reason: 'a hijacked callback must not be adopted');
    expect(t.exchanges, isEmpty, reason: 'a rejected callback must never be exchanged');
  });

  test('a matching state exchanges the code and signs in', () async {
    final t = build((cb) => '${cb.replace(queryParameters: {
          ssoStateParam: cb.queryParameters[ssoStateParam],
          ssoCodeParam: 'the-code',
        })}');
    expect(await t.sso.signIn('idp'), isTrue);
    expect(t.tokens.token, 'bearer-from-exchange');
    expect(t.exchanges.single['code'], 'the-code');
  });

  test('the verifier travels only in the exchange body, never in the redirect', () async {
    final t = build((cb) => '${cb.replace(queryParameters: {
          ssoStateParam: cb.queryParameters[ssoStateParam],
          ssoCodeParam: 'the-code',
        })}');
    await t.sso.signIn('idp');
    final verifier = t.exchanges.single['verifier'] as String;
    final asked = t.callbacks.single;
    expect(asked.query, isNot(contains(verifier)));
    // What the redirect did carry is the SHA-256 of it.
    expect(
      asked.queryParameters[ssoChallengeParam],
      base64Url.encode(sha256.convert(utf8.encode(verifier)).bytes).replaceAll('=', ''),
    );
  });

  test('no bearer is ever read straight off the callback URL', () async {
    for (final name in const ['token', 'set-auth-token', 'session', 'access_token']) {
      final t = build((cb) => '${cb.replace(queryParameters: {
            ssoStateParam: cb.queryParameters[ssoStateParam],
            name: 'stolen',
          })}');
      await expectLater(t.sso.signIn('idp'), throwsA(isA<SsoException>()));
      expect(t.tokens.token, isNull);
    }
  });

  test('an error callback surfaces instead of failing silently', () async {
    final t = build((cb) => '${cb.replace(queryParameters: {
          ssoStateParam: cb.queryParameters[ssoStateParam],
          'error': 'access_denied',
        })}');
    await expectLater(
      t.sso.signIn('idp'),
      throwsA(isA<SsoException>().having((e) => e.reason, 'reason', 'access_denied')),
    );
  });

  test('a refused exchange does not sign the user in', () async {
    final t = build((cb) => '${cb.replace(queryParameters: {
          ssoStateParam: cb.queryParameters[ssoStateParam],
          ssoCodeParam: 'replayed',
        })}');
    await expectLater(t.sso.signIn('idp'), throwsA(isA<Object>()));
    expect(t.tokens.token, isNull);
  });

  test('each attempt generates a fresh state and verifier', () async {
    final t = build((cb) => '${cb.replace(queryParameters: {
          ssoStateParam: cb.queryParameters[ssoStateParam],
          ssoCodeParam: 'the-code',
        })}');
    await t.sso.signIn('idp');
    await t.sso.signIn('idp');
    expect(t.callbacks.map((c) => c.queryParameters[ssoStateParam]).toSet(), hasLength(2));
    expect(t.callbacks.map((c) => c.queryParameters[ssoChallengeParam]).toSet(), hasLength(2));
    expect(t.exchanges.map((e) => e['verifier']).toSet(), hasLength(2));
  });
}

/// Answers `/api/auth/sign-in/sso` with an authorize URL, records the
/// callbackURL the app asked for, and plays the exchange endpoint: only the
/// well-formed `the-code` redemption yields a bearer.
class _SsoAdapter extends RouteAdapter {
  _SsoAdapter(this.callbacks, this.exchanges)
      : super({
          '/api/auth/sign-in/sso': () => Reply(200, {'url': 'https://idp.example/authorize'}),
        });
  final List<Uri> callbacks;
  final List<Map<String, dynamic>> exchanges;

  @override
  Future<ResponseBody> fetch(
      RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) {
    final body = options.data;
    if (body is Map && body['callbackURL'] is String) {
      callbacks.add(Uri.parse(body['callbackURL'] as String));
    }
    if (options.path == '/api/sso/mobile-exchange' && body is Map<String, dynamic>) {
      exchanges.add(body);
      final ok = body['code'] == 'the-code';
      return Future.value(ResponseBody.fromString(
        jsonEncode(ok ? {'token': 'bearer-from-exchange'} : {'statusMessage': 'unknown code'}),
        ok ? 200 : 404,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      ));
    }
    return super.fetch(options, requestStream, cancelFuture);
  }
}
