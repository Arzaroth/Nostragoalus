import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:nostragoalus/e2ee/e2ee.dart' as e2ee;
import 'package:sodium_libs/sodium_libs_sumo.dart';

/// Phase 3 crown jewel, ON DEVICE: prove the app's e2ee module reproduces the
/// web app's decrypt/derive byte-for-byte, using the real native libsodium from
/// sodium_libs (not the system lib the parity `dart test` uses). If this is
/// green, a Flutter client can decrypt what the web wrote.
///   flutter test integration_test/e2ee_interop_test.dart -d emulator-5554
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  // The harness $b64 tag is STANDARD (padded) base64 - it mirrors the TS side's
  // Buffer.from(x,'base64'), NOT e2ee's url-safe wire format.
  dynamic revive(dynamic x) {
    if (x is Map && x.length == 1 && x.containsKey(r'$b64')) {
      return base64.decode(x[r'$b64'] as String);
    }
    if (x is List) return x.map(revive).toList();
    if (x is Map) return x.map((k, v) => MapEntry(k, revive(v)));
    return x;
  }

  dynamic encode(dynamic x) => x is Uint8List ? {r'$b64': base64.encode(x)} : x;

  testWidgets('e2ee module matches the frozen TS KATs via native libsodium', (tester) async {
    final sodium = await SodiumSumoInit.init();
    final vf = jsonDecode(await rootBundle.loadString('assets/parity/e2ee.json'))
        as Map<String, dynamic>;

    dynamic dispatch(String fn, List<dynamic> rawArgs) {
      final a = rawArgs.map(revive).toList();
      return switch (fn) {
        'fingerprint' => e2ee.fingerprint(sodium, a[0] as String),
        'openGroupKey' => encode(e2ee
            .openGroupKey(sodium, a[0] as String,
                publicKey: (a[1] as Map)['publicKey'] as String,
                privateKey:
                    SecureKey.fromList(sodium, (a[1] as Map)['privateKey'] as Uint8List))
            .extractBytes()),
        'decryptMessage' => e2ee.decryptMessage(
            sodium, a[0] as String, SecureKey.fromList(sodium, a[1] as Uint8List)),
        'decryptBytes' => encode(e2ee.decryptBytes(
            sodium, a[0] as String, SecureKey.fromList(sodium, a[1] as Uint8List))),
        'unwrapPrivateKeyWithRecovery' => encode(
            e2ee.unwrapPrivateKeyWithRecovery(sodium, a[0] as String, a[1] as String)
                .extractBytes()),
        _ => throw StateError('unknown fn $fn'),
      };
    }

    final cases = vf['cases'] as List;
    expect(cases, isNotEmpty);
    for (var i = 0; i < cases.length; i++) {
      final c = cases[i] as Map<String, dynamic>;
      final actual = dispatch(c['fn'] as String, c['args'] as List);
      expect(jsonEncode(actual), equals(jsonEncode(c['expected'])),
          reason: '${c['fn']} #$i mismatch');
    }
  });
}
