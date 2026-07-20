import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/e2ee/e2ee.dart' as e2ee;
import 'package:sodium/sodium_sumo.dart';

import 'sodium_loader.dart';

/// The encrypt/seal half is random (no KAT freezes it), so it's proven by
/// round-tripping through the KAT-verified decrypt half: what the app encrypts,
/// the app (and therefore the web, same primitives + wire format) decrypts.
/// Headless via the system libsodium, so it runs in the gate.
void main() {
  late SodiumSumo sodium;

  setUpAll(() async => sodium = await SodiumSumoInit.init(loadLibsodium));

  test('e2ee encrypt round-trips through the proven decrypt path', () {
    // message <-> group key
    final groupKey = e2ee.generateGroupKey(sodium);
    const plain = 'goal in the 90th 🔥 - {"score":"2-1"}';
    expect(e2ee.decryptMessage(sodium, e2ee.encryptMessage(sodium, plain, groupKey), groupKey),
        equals(plain));

    // attachment bytes
    final bytes = Uint8List.fromList(List.generate(1024, (i) => i % 256));
    expect(e2ee.decryptBytes(sodium, e2ee.encryptBytes(sodium, bytes, groupKey), groupKey),
        equals(bytes));

    // group key sealed to an identity <-> opened with its keypair
    final id = e2ee.generateIdentity(sodium);
    final wrapped = e2ee.sealGroupKey(sodium, groupKey, id.publicKey);
    final opened = e2ee.openGroupKey(sodium, wrapped,
        publicKey: id.publicKey, privateKey: id.privateKey);
    expect(opened.extractBytes(), equals(groupKey.extractBytes()));
    expect(e2ee.keyPairMatches(sodium, id.publicKey, id.privateKey), isTrue);

    // private key escrow <-> recovery-code unwrap
    const code = 'ABCDEF-GHIJKL-MNOPQR-STUVWX';
    final blob = e2ee.wrapPrivateKeyWithRecovery(sodium, id.privateKey, code);
    expect(e2ee.unwrapPrivateKeyWithRecovery(sodium, blob, code).extractBytes(),
        equals(id.privateKey.extractBytes()));

    // recovery code shape: url-safe base64 of 18 bytes, hyphen-grouped by 6
    final generated = e2ee.generateRecoveryCode(sodium);
    expect(generated.replaceAll('-', '').length, equals(24));
    expect(base64Url.decode(generated.replaceAll('-', '')).length, equals(18));
  });
}
