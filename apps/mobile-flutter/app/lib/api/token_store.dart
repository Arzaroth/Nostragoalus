import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Minimal key/value seam so the token store is unit-testable without the
/// platform keystore (the flutter_secure_storage plugin has no headless impl).
abstract class SecureKv {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class FlutterSecureKv implements SecureKv {
  const FlutterSecureKv([this._storage = const FlutterSecureStorage()]);
  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);
  @override
  Future<void> write(String key, String value) => _storage.write(key: key, value: value);
  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}

/// Persists the better-auth bearer token in the platform keystore. A native
/// client authenticates with `Authorization: Bearer <token>` (proven by the
/// Phase 0 auth spike) instead of the session cookie.
class TokenStore {
  TokenStore([SecureKv? kv]) : _kv = kv ?? const FlutterSecureKv();

  final SecureKv _kv;
  static const _key = 'ng_bearer';

  // In-memory mirror so the request interceptor stays synchronous and avoids a
  // keystore round-trip on every call. Seeded by load() at startup.
  String? _cached;

  String? get token => _cached;

  Future<String?> load() async => _cached = await _kv.read(_key);

  Future<void> save(String token) async {
    _cached = token;
    await _kv.write(_key, token);
  }

  Future<void> clear() async {
    _cached = null;
    await _kv.delete(_key);
  }
}
