import '../chat/chat_crypto.dart';
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
    this.twoFactorEnabled,
    this.onboardingTourDismissedAt,
    this.emailVerified,
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
  final bool? twoFactorEnabled;
  final String? onboardingTourDismissedAt; // null => the one-time tour can auto-start
  final bool? emailVerified;

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
        twoFactorEnabled: json['twoFactorEnabled'] as bool?,
        onboardingTourDismissedAt: json['onboardingTourDismissedAt']?.toString(),
        emailVerified: json['emailVerified'] as bool?,
      );
}

/// Email/password auth over the bearer contract. Sign-in surfaces the token in
/// the `set-auth-token` header (captured by [ApiClient]); every later call reads
/// it from the [TokenStore].
/// How the server wants an account deletion confirmed (`/api/me/sso-status`).
class DeletionPolicy {
  const DeletionPolicy({required this.mailConfirmed, required this.ssoManaged});

  /// The server can send mail, so it mails a link and deletes only once the
  /// link is opened; no password up front.
  final bool mailConfirmed;

  /// The IdP owns the password, so without mail the session alone confirms.
  final bool ssoManaged;

  bool get needsPassword => !mailConfirmed && !ssoManaged;
}

class AuthRepository {
  AuthRepository(this._api, this._tokens);

  final ApiClient _api;
  final TokenStore _tokens;

  Future<AuthUser> signIn(String email, String password) async {
    final res = await _api
        .postJson('/api/auth/sign-in/email', body: {'email': email, 'password': password});
    // The interceptor persisted the token from set-auth-token; confirm it landed.
    if (_tokens.token == null) {
      throw ApiException(200, 'sign-in returned no bearer token');
    }
    final user = res['user'];
    if (user is Map<String, dynamic>) return AuthUser.fromJson(user);
    // Some flows return only the token; fall back to a session fetch.
    final session = await currentUser();
    if (session != null) return session;
    throw ApiException(200, 'sign-in succeeded but no user payload');
  }

  /// The current user, or null when there is no valid session.
  Future<AuthUser?> currentUser() async {
    if (_tokens.token == null) return null;
    final Map<String, dynamic> res;
    try {
      res = await _api.getJson('/api/auth/get-session');
    } on ApiException {
      return null;
    }
    final user = res['user'];
    return user is Map<String, dynamic> ? AuthUser.fromJson(user) : null;
  }

  /// Create an account. Throws [ApiException] carrying the server body (email
  /// taken, weak password, ...); email verification may still be required before
  /// sign-in works.
  Future<void> signUp(String name, String email, String password) async {
    await _api.postJson('/api/auth/sign-up/email',
        body: {'name': name, 'email': email, 'password': password});
  }

  /// Email a password-reset link. Throws [ApiException] when the server refuses.
  Future<void> requestPasswordReset(String email) async {
    await _api.postJson('/api/auth/request-password-reset',
        body: {'email': email, 'redirectTo': '/reset-password'});
  }

  Future<void> signOut() async {
    try {
      await _api.postJson('/api/auth/sign-out');
    } on ApiException {
      // The local token goes either way; a failed server-side revoke must not
      // leave the app stuck signed in.
    } finally {
      await _clearLocal();
    }
  }

  Future<DeletionPolicy> deletionPolicy() async {
    final res = await _api.getJson('/api/me/sso-status');
    return DeletionPolicy(
      mailConfirmed: res['mailEnabled'] == true,
      ssoManaged: res['ssoManaged'] == true,
    );
  }

  /// Deletes the account, or under a mail-confirmed [policy] asks the server
  /// to mail the confirmation link. True when the account is already gone,
  /// false when it waits on the link. [totpCode] is required by the server for
  /// a 2FA account unless the deletion goes through the mailed link.
  Future<bool> deleteAccount(DeletionPolicy policy, {String? password, String? totpCode}) async {
    if (policy.mailConfirmed) {
      await _api.postJson('/api/auth/delete-user', body: {'callbackURL': '/login'});
      return false;
    }
    await _api.postJson('/api/auth/delete-user',
        body: {if (policy.needsPassword) 'password': password ?? ''},
        headers: totpCode == null ? null : {'x-totp-code': totpCode});
    await _clearLocal();
    return true;
  }

  Future<void> _clearLocal() async {
    await _tokens.clear();
    // The chat private key is per-account: leaving it behind lets the next
    // account on this device read it (and, on its own bootstrap, overwrite it).
    try {
      await ChatKeyStore().clearCurrent();
    } catch (_) {/* no platform keystore (headless test / unsupported host) */}
  }
}
