import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/api.dart';

import 'build_client.dart';
import 'helpers.dart';

void main() {
  group('account security', () {
    test('listSessions reads the better-auth array', () async {
      final (api, adapter) = buildApi([
        Reply(200, const [
          {'token': 't1'},
          {'token': 't2'},
        ]),
      ]);

      expect(await api.listSessions(), hasLength(2));
      expectRequest(adapter, method: 'GET', path: '/api/auth/list-sessions');
    });

    // The wrapped-body fallback must not swallow a genuine error body.
    test('listSessions rethrows when the error body has no sessions', () async {
      final (api, _) = buildApi([
        Reply(500, const {'sessions': 'not a list'}),
      ]);
      await expectLater(api.listSessions(), throwsStatus(500));
    });

    test('revokeSession posts the session token', () async {
      final (api, adapter) = buildApi([Reply(200, const {'status': true})]);

      await api.revokeSession('tok');

      expectRequest(adapter,
          method: 'POST', path: '/api/auth/revoke-session', body: {'token': 'tok'});
    });

    test('twoFactorEnable returns the enrolment payload', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {
          'totpURI': 'otpauth://x',
          'backupCodes': ['a', 'b'],
        }),
      ]);

      final res = await api.twoFactorEnable('pw');
      expect(res['totpURI'], 'otpauth://x');
      expectRequest(adapter,
          method: 'POST', path: '/api/auth/two-factor/enable', body: {'password': 'pw'});
    });

    test('twoFactorVerify posts the code', () async {
      final (api, adapter) = buildApi([Reply(200, const {'status': true})]);

      await api.twoFactorVerify('123456');

      expectRequest(adapter,
          method: 'POST',
          path: '/api/auth/two-factor/verify-totp',
          body: {'code': '123456'});
    });

    test('twoFactorBackupCodes posts the password', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {
          'backupCodes': ['a'],
        }),
      ]);

      final res = await api.twoFactorBackupCodes('pw');
      expect(res['backupCodes'], ['a']);
      expectRequest(adapter,
          method: 'POST',
          path: '/api/auth/two-factor/generate-backup-codes',
          body: {'password': 'pw'});
    });

    test('twoFactorDisable posts the password', () async {
      final (api, adapter) = buildApi([Reply(200, const {'status': true})]);

      await api.twoFactorDisable('pw');

      expectRequest(adapter,
          method: 'POST', path: '/api/auth/two-factor/disable', body: {'password': 'pw'});
    });

    test('confirmTotp unwraps the validity flag', () async {
      final (api, adapter) = buildApi([Reply(200, const {'valid': false})]);

      expect(await api.confirmTotp('000000'), isFalse);
      expectRequest(adapter,
          method: 'POST', path: '/api/me/confirm-totp', body: {'code': '000000'});
    });

    test('a wrong password on 2FA enrolment surfaces as an ApiException', () async {
      final (api, _) = buildFailing(401);
      await expectLater(api.twoFactorEnable('bad'), throwsStatus(401));
    });

    test('confirmTotp surfaces a server failure', () async {
      final (api, _) = buildFailing(400);
      await expectLater(api.confirmTotp('000000'), throwsStatus(400));
    });

    test('revokeSession surfaces a server failure', () async {
      final (api, _) = buildFailing(403);
      await expectLater(api.revokeSession('t'), throwsStatus(403));
    });
  });

  group('sso', () {
    test('ssoCheck sends the email as a query', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'providerId': 'okta', 'name': 'Okta'}),
      ]);

      final res = await api.ssoCheck('a@b.tld');
      expect(res['providerId'], 'okta');
      expectRequest(adapter,
          method: 'GET', path: '/api/sso/check', query: {'email': 'a@b.tld'});
    });

    test('ssoAuthorizeUrl returns the IdP URL', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'url': 'https://idp/authorize'}),
      ]);

      expect(await api.ssoAuthorizeUrl('okta', 'ng://cb'), 'https://idp/authorize');
      expectRequest(adapter, method: 'POST', path: '/api/auth/sign-in/sso', body: {
        'providerId': 'okta',
        'callbackURL': 'ng://cb',
      });
    });

    test('ssoAuthorizeUrl is null when the server returns no url', () async {
      final (api, _) = buildApi([Reply(200, const {})]);
      expect(await api.ssoAuthorizeUrl('okta', 'ng://cb'), isNull);
    });

    test('ssoExchange trades the code, state and verifier for a bearer', () async {
      final (api, adapter) = buildApi([Reply(200, const {'token': 'bearer'})]);

      final token = await api.ssoExchange(code: 'c', state: 's', verifier: 'v');

      expect(token, 'bearer');
      expectRequest(adapter, method: 'POST', path: '/api/sso/mobile-exchange', body: {
        'code': 'c',
        'state': 's',
        'verifier': 'v',
      });
    });

    test('ssoExchange is null when the server returns no token', () async {
      final (api, _) = buildApi([Reply(200, const {})]);
      expect(await api.ssoExchange(code: 'c', state: 's', verifier: 'v'), isNull);
    });

    test('a replayed exchange code surfaces as an ApiException', () async {
      final (api, _) = buildFailing(400);
      await expectLater(
          api.ssoExchange(code: 'c', state: 's', verifier: 'v'), throwsStatus(400));
    });

    test('ssoCheck surfaces a server failure', () async {
      final (api, _) = buildFailing(500);
      await expectLater(api.ssoCheck('a@b.tld'), throwsStatus(500));
    });
  });
}
