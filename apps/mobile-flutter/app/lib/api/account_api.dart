import 'api_client.dart';
import 'models.gen.dart';

/// Account security: the connected-device list and two-factor enrolment.
extension AccountApi on ApiClient {
  /// A failure throws: on a security screen, an empty device list must never be
  /// indistinguishable from a call that never succeeded.
  Future<List<dynamic>> listSessions() async {
    try {
      return await getList('/api/auth/list-sessions');
    } on ApiException catch (e) {
      // Some better-auth versions wrap the array in {sessions: [...]}.
      final body = e.body;
      if (body is Map && body['sessions'] is List) return body['sessions'] as List;
      rethrow;
    }
  }

  Future<void> revokeSession(String token) async =>
      postJson('/api/auth/revoke-session', body: {'token': token});

  /// Begin 2FA enrolment: returns {totpURI, backupCodes}. Confirm with twoFactorVerify.
  Future<Map<String, dynamic>> twoFactorEnable(String password) async =>
      postJson('/api/auth/two-factor/enable', body: {'password': password});

  Future<void> twoFactorVerify(String code) async =>
      postJson('/api/auth/two-factor/verify-totp', body: {'code': code});

  Future<Map<String, dynamic>> twoFactorBackupCodes(String password) async =>
      postJson('/api/auth/two-factor/generate-backup-codes', body: {'password': password});

  Future<void> twoFactorDisable(String password) async =>
      postJson('/api/auth/two-factor/disable', body: {'password': password});

  /// Check a current TOTP code (used to gate disabling 2FA).
  Future<bool> confirmTotp(String code) async =>
      ConfirmTotpResponse.fromJson(await postJson('/api/me/confirm-totp', body: {'code': code}))
          .valid;
}
