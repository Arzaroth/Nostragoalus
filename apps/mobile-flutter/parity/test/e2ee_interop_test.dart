import 'dart:convert';
import 'dart:ffi';
import 'dart:io';
import 'dart:typed_data';

import 'package:nostragoalus_parity/e2ee.dart' as e2ee;
import 'package:nostragoalus_parity/harness.dart';
import 'package:sodium/sodium_sumo.dart';
import 'package:test/test.dart';

// Phase 0 spike #3: prove `sodium` (libsodium) in Dart reproduces the web app's
// E2EE decrypt/derive byte-for-byte, against the frozen KATs in
// shared/parity-json/e2ee.json. If this is green, a Flutter client can decrypt
// what the web wrote - the whole E2EE chat/DM story rests on it.
//
// In a plain `dart test` we load the SYSTEM libsodium via ffi (in the Flutter app
// it comes from sodium_libs). Install it first:
//   Linux: apt install libsodium23     macOS: brew install libsodium

DynamicLibrary _loadLibsodium() {
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

const _vectorsPath = '$vectorsDir/e2ee.json';

// The harness $b64 tag is STANDARD base64 (padded) - it mirrors the TS side's
// `Buffer.from(x, 'base64')` / `Buffer.from(x).toString('base64')` in
// tests/parity/dispatch.ts, NOT e2ee's url-safe wire format.
dynamic _revive(dynamic x) {
  if (x is Map && x.length == 1 && x.containsKey(r'$b64')) {
    return base64.decode(x[r'$b64'] as String);
  }
  if (x is List) return x.map(_revive).toList();
  if (x is Map) return x.map((k, v) => MapEntry(k, _revive(v)));
  return x;
}

dynamic _encode(dynamic x) => x is Uint8List ? {r'$b64': base64.encode(x)} : x;

void main() async {
  final sodium = await SodiumSumoInit.init(_loadLibsodium);
  final vf = jsonDecode(File(_vectorsPath).readAsStringSync()) as Map<String, dynamic>;

  dynamic dispatch(String fn, List rawArgs) {
    final a = rawArgs.map(_revive).toList();
    switch (fn) {
      case 'fingerprint':
        return e2ee.fingerprint(sodium, a[0] as String);
      case 'openGroupKey':
        return _encode(e2ee.openGroupKey(sodium, a[0] as String, a[1] as Map));
      case 'decryptMessage':
        return e2ee.decryptMessage(sodium, a[0] as String, a[1] as Uint8List);
      case 'decryptBytes':
        return _encode(e2ee.decryptBytes(sodium, a[0] as String, a[1] as Uint8List));
      case 'unwrapPrivateKeyWithRecovery':
        return _encode(e2ee.unwrapPrivateKeyWithRecovery(sodium, a[0] as String, a[1] as String));
      default:
        throw StateError('unknown fn $fn');
    }
  }

  group('e2ee interop - sodium vs the frozen TS KATs', () {
    final cases = vf['cases'] as List;
    for (var i = 0; i < cases.length; i++) {
      final c = cases[i] as Map<String, dynamic>;
      test('${c['fn']} #$i', () {
        final actual = dispatch(c['fn'] as String, c['args'] as List);
        expect(
          deepEquals(actual, c['expected']),
          isTrue,
          reason: '${c['fn']}(${jsonEncode(c['args'])})\n'
              '  expected: ${jsonEncode(c['expected'])}\n'
              '  actual:   ${jsonEncode(actual)}',
        );
      });
    }
  });
}
