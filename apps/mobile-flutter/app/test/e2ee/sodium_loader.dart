import 'dart:ffi';

/// The SYSTEM libsodium, for headless `flutter test` (the app itself gets the
/// bundled native lib from sodium_libs). Same candidate list as
/// parity/test/e2ee_interop_test.dart.
///   Linux: apt install libsodium23     macOS: brew install libsodium
DynamicLibrary loadLibsodium() {
  const candidates = [
    'libsodium.so.26', 'libsodium.so.23', 'libsodium.so',
    '/lib64/libsodium.so.26', '/lib/libsodium.so.26',
    'libsodium.dylib', '/opt/homebrew/lib/libsodium.dylib', '/usr/local/lib/libsodium.dylib',
  ];
  for (final name in candidates) {
    try {
      return DynamicLibrary.open(name);
    } catch (_) {/* try next */}
  }
  throw StateError('libsodium not found - install it (see the header comment)');
}
