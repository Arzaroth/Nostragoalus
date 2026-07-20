import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/e2ee/e2ee.dart' as e2ee;
import 'package:sodium/sodium_sumo.dart';

import 'sodium_loader.dart';

// The NEGATIVE half of the crypto contract: the round-trip and KAT suites prove
// what must work, this proves what must FAIL.
void main() {
  late SodiumSumo sodium;

  setUpAll(() async => sodium = await SodiumSumoInit.init(loadLibsodium));

  group('decryptMessage rejects', () {
    test('a message sealed under a different group key', () {
      final packed = e2ee.encryptMessage(sodium, 'penalty!', e2ee.generateGroupKey(sodium));
      expect(() => e2ee.decryptMessage(sodium, packed, e2ee.generateGroupKey(sodium)),
          throwsA(isA<Object>()));
    });

    test('a single flipped ciphertext byte', () {
      final key = e2ee.generateGroupKey(sodium);
      final raw = e2ee.b64decode(e2ee.encryptMessage(sodium, 'penalty!', key));
      raw[raw.length - 1] ^= 0x01;
      expect(() => e2ee.decryptMessage(sodium, e2ee.b64encode(raw), key),
          throwsA(isA<Object>()));
    });

    test('a blob shorter than the nonce', () {
      final key = e2ee.generateGroupKey(sodium);
      final short = Uint8List(sodium.crypto.secretBox.nonceBytes - 1);
      expect(() => e2ee.decryptMessage(sodium, e2ee.b64encode(short), key),
          throwsA(isA<Object>()));
    });
  });

  test('unwrapPrivateKeyWithRecovery rejects a wrong recovery code', () {
    final id = e2ee.generateIdentity(sodium);
    final blob = e2ee.wrapPrivateKeyWithRecovery(sodium, id.privateKey, 'ABCDEF-GHIJKL');
    expect(() => e2ee.unwrapPrivateKeyWithRecovery(sodium, blob, 'ABCDEF-GHIJKM'),
        throwsA(isA<Object>()));
  });

  test('every encryptMessage call uses a fresh nonce', () {
    final key = e2ee.generateGroupKey(sodium);
    final n = sodium.crypto.secretBox.nonceBytes;
    final nonces = <String>{};
    for (var i = 0; i < 100; i++) {
      nonces.add(e2ee.b64encode(
          Uint8List.sublistView(e2ee.b64decode(e2ee.encryptMessage(sodium, 'same text', key)), 0, n)));
    }
    expect(nonces.length, equals(100));
  });

  test('keyPairMatches only accepts the private key of that public key', () {
    final a = e2ee.generateIdentity(sodium);
    final b = e2ee.generateIdentity(sodium);
    expect(e2ee.keyPairMatches(sodium, a.publicKey, a.privateKey), isTrue);
    expect(e2ee.keyPairMatches(sodium, a.publicKey, b.privateKey), isFalse);
  });

  group('b64decode rejects what the wire format cannot hold', () {
    test('a length that no base64 encoder produces', () {
      expect(() => e2ee.b64decode('AAAAA'), throwsFormatException);
    });

    test('the standard (non url-safe) alphabet', () {
      expect(() => e2ee.b64decode('a+b/cd'), throwsFormatException);
    });

    test('but round-trips the url-safe unpadded form', () {
      final bytes = Uint8List.fromList(List.generate(37, (i) => (i * 7) % 256));
      expect(e2ee.b64decode(e2ee.b64encode(bytes)), equals(bytes));
    });
  });
}
