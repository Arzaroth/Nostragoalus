import 'dart:convert';
import 'dart:typed_data';

import 'package:sodium/sodium_sumo.dart';

// Dart port of the web app's app/utils/e2ee.ts, using libsodium via the `sodium`
// ffi package - the same primitives as libsodium-wrappers-sumo. This is the ONE
// copy: the Flutter app imports it through package:nostragoalus_parity, so the
// code the device ships is the code the frozen vectors
// (shared/parity-json/e2ee.json) replay. Keep it free of Flutter.
//
// The deterministic half (decrypt / unseal / derive) is what a vector can lock;
// the encrypt / seal side is random and covered by round-trip tests that decrypt
// with the frozen-proven functions.
//
// Pass an initialized SodiumSumo (test/e2ee_interop_test.dart loads the system
// libsodium for a plain `dart test`; in the app it comes from sodium_libs).

final _b64UrlAlphabet = RegExp(r'^[A-Za-z0-9_-]*$');

/// url-safe base64, NO padding (base64_variants.URLSAFE_NO_PADDING on the wire).
Uint8List b64decode(String s) {
  // Dart's base64Url also accepts the standard `+/` alphabet and a length%4==1
  // string (which no base64 encoder can produce); libsodium's URLSAFE_NO_PADDING
  // rejects both, so reject them here rather than decode something the web never
  // wrote.
  if (s.length % 4 == 1 || !_b64UrlAlphabet.hasMatch(s)) {
    throw const FormatException('not url-safe unpadded base64');
  }
  return base64Url.decode(s + '=' * ((4 - s.length % 4) % 4));
}

String b64encode(Uint8List b) => base64Url.encode(b).replaceAll('=', '');

String _normalizeCode(String code) => code.replaceAll(RegExp(r'[\s-]'), '');

/// crypto_generichash(30) of the public key -> six groups of five digits (the
/// safety number shown for key-transparency verification).
String fingerprint(SodiumSumo sodium, String publicKey) {
  final digest = sodium.crypto.genericHash(outLen: 30, message: b64decode(publicKey));
  final groups = <String>[];
  for (var i = 0; i < 6; i++) {
    var n = 0;
    for (var j = 0; j < 5; j++) {
      n = (n * 256 + digest[i * 5 + j]) % 100000;
    }
    groups.add(n.toString().padLeft(5, '0'));
  }
  return groups.join(' ');
}

/// crypto_box_seal_open: unwrap a group key sealed to me. The caller owns
/// [privateKey]; the returned group key is owned by the caller.
SecureKey openGroupKey(
  SodiumSumo sodium,
  String wrapped, {
  required String publicKey,
  required SecureKey privateKey,
}) =>
    SecureKey.fromList(
      sodium,
      sodium.crypto.box.sealOpen(
        cipherText: b64decode(wrapped),
        publicKey: b64decode(publicKey),
        secretKey: privateKey,
      ),
    );

Uint8List _openSecretBox(SodiumSumo sodium, Uint8List packed, SecureKey key) {
  final n = sodium.crypto.secretBox.nonceBytes;
  final nonce = packed.sublist(0, n);
  final ct = packed.sublist(n);
  return sodium.crypto.secretBox.openEasy(cipherText: ct, nonce: nonce, key: key);
}

/// crypto_secretbox_open_easy of a nonce-prefixed text message.
String decryptMessage(SodiumSumo sodium, String packed, SecureKey groupKey) =>
    utf8.decode(_openSecretBox(sodium, b64decode(packed), groupKey));

/// Same, binary payload (attachment bytes).
Uint8List decryptBytes(SodiumSumo sodium, String packed, SecureKey groupKey) =>
    _openSecretBox(sodium, b64decode(packed), groupKey);

// --- encrypt / seal side (mirrors the web e2ee.ts; random, so not KAT-frozen -
// covered by the round-trip test that decrypts with the proven functions above) ---

/// A fresh X25519 chat identity. Public key base64; private key stays on device.
({String publicKey, SecureKey privateKey}) generateIdentity(SodiumSumo sodium) {
  final kp = sodium.crypto.box.keyPair();
  return (publicKey: b64encode(kp.publicKey), privateKey: kp.secretKey);
}

/// Whether [privateKey] is the secret half of [publicKey]: seal a probe to the
/// public key and unseal it with the private one. libsodium exposes no
/// scalarmult-base binding here, and a sealed-box round trip proves the same
/// pairing (crypto_box_seal derives the recipient key from the public key).
bool keyPairMatches(SodiumSumo sodium, String publicKey, SecureKey privateKey) {
  final pub = b64decode(publicKey);
  final probe = sodium.randombytes.buf(32);
  try {
    final opened = sodium.crypto.box.sealOpen(
      cipherText: sodium.crypto.box.seal(message: probe, publicKey: pub),
      publicKey: pub,
      secretKey: privateKey,
    );
    return opened.length == probe.length &&
        List.generate(probe.length, (i) => opened[i] == probe[i]).every((e) => e);
  } catch (_) {
    return false;
  }
}

/// A fresh random secretbox key for a league's chat.
SecureKey generateGroupKey(SodiumSumo sodium) => sodium.crypto.secretBox.keygen();

/// crypto_box_seal: wrap the group key to a member's public key (anonymous).
String sealGroupKey(SodiumSumo sodium, SecureKey groupKey, String recipientPublicKey) =>
    b64encode(sodium.crypto.box
        .seal(message: groupKey.extractBytes(), publicKey: b64decode(recipientPublicKey)));

String _seal(SodiumSumo sodium, Uint8List message, SecureKey groupKey) {
  final nonce = sodium.randombytes.buf(sodium.crypto.secretBox.nonceBytes);
  final ct = sodium.crypto.secretBox.easy(message: message, nonce: nonce, key: groupKey);
  return b64encode(Uint8List.fromList([...nonce, ...ct]));
}

/// Encrypt a text message under the group key (nonce-prefixed secretbox).
String encryptMessage(SodiumSumo sodium, String plaintext, SecureKey groupKey) =>
    _seal(sodium, Uint8List.fromList(utf8.encode(plaintext)), groupKey);

/// Encrypt attachment bytes under the group key.
String encryptBytes(SodiumSumo sodium, Uint8List bytes, SecureKey groupKey) =>
    _seal(sodium, bytes, groupKey);

/// A high-entropy recovery code, grouped for readability (never user-chosen).
String generateRecoveryCode(SodiumSumo sodium) {
  // The base64url alphabet contains '-', which is also the grouping separator,
  // so an encoding carrying one would be indistinguishable from a separator and
  // normalizeCode would silently eat a data character. Resample instead of
  // substituting, which would skew the distribution.
  var str = b64encode(sodium.randombytes.buf(18));
  while (str.contains('-')) {
    str = b64encode(sodium.randombytes.buf(18));
  }
  final out = StringBuffer();
  for (var i = 0; i < str.length; i += 6) {
    if (i > 0) out.write('-');
    out.write(str.substring(i, i + 6 > str.length ? str.length : i + 6));
  }
  return out.toString();
}

SecureKey _recoveryKey(SodiumSumo sodium, String code, Uint8List salt) => sodium.crypto.pwhash.call(
      outLen: sodium.crypto.secretBox.keyBytes,
      password: Int8List.fromList(utf8.encode(_normalizeCode(code))),
      salt: salt,
      opsLimit: sodium.crypto.pwhash.opsLimitInteractive,
      memLimit: sodium.crypto.pwhash.memLimitInteractive,
      alg: CryptoPwhashAlgorithm.argon2id13,
    );

/// Wrap the private key under the recovery code for server-side escrow
/// (salt + nonce + ciphertext).
String wrapPrivateKeyWithRecovery(SodiumSumo sodium, SecureKey privateKey, String code) {
  final salt = sodium.randombytes.buf(sodium.crypto.pwhash.saltBytes);
  final key = _recoveryKey(sodium, code, salt);
  try {
    final nonce = sodium.randombytes.buf(sodium.crypto.secretBox.nonceBytes);
    final ct = sodium.crypto.secretBox
        .easy(message: privateKey.extractBytes(), nonce: nonce, key: key);
    return b64encode(Uint8List.fromList([...salt, ...nonce, ...ct]));
  } finally {
    key.dispose();
  }
}

/// crypto_pwhash(Argon2id, INTERACTIVE) of the recovery code, then secretbox open -
/// recovers the identity private key on a new device from the recovery code.
SecureKey unwrapPrivateKeyWithRecovery(SodiumSumo sodium, String blob, String code) {
  final raw = b64decode(blob);
  final saltLen = sodium.crypto.pwhash.saltBytes;
  final salt = raw.sublist(0, saltLen);
  final rest = raw.sublist(saltLen); // nonce + ct

  final key = _recoveryKey(sodium, code, salt);
  try {
    return SecureKey.fromList(sodium, _openSecretBox(sodium, rest, key));
  } finally {
    key.dispose();
  }
}
