import 'dart:convert';
import 'dart:typed_data';

import 'package:sodium/sodium_sumo.dart';

// The DETERMINISTIC half of the web app's e2ee.ts (decrypt / unseal / derive),
// via libsodium. Byte-parity with the web is frozen by shared/parity-json/e2ee.json
// and proven on-device by integration_test/e2ee_interop_test.dart. The encrypt /
// seal side is random and not ported here (sending is a later slice). `sodium`
// is the initialised SodiumSumo from sodium_libs.

/// url-safe base64, NO padding (base64_variants.URLSAFE_NO_PADDING on the wire).
Uint8List b64decode(String s) {
  final pad = (4 - s.length % 4) % 4;
  return base64Url.decode(s + '=' * pad);
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

/// crypto_box_seal_open: unwrap a group key sealed to me.
Uint8List openGroupKey(SodiumSumo sodium, String wrapped, Map identity) {
  final sk = SecureKey.fromList(sodium, identity['privateKey'] as Uint8List);
  try {
    return sodium.crypto.box.sealOpen(
      cipherText: b64decode(wrapped),
      publicKey: b64decode(identity['publicKey'] as String),
      secretKey: sk,
    );
  } finally {
    sk.dispose();
  }
}

Uint8List _openSecretBox(SodiumSumo sodium, Uint8List packed, SecureKey key) {
  final n = sodium.crypto.secretBox.nonceBytes;
  final nonce = packed.sublist(0, n);
  final ct = packed.sublist(n);
  return sodium.crypto.secretBox.openEasy(cipherText: ct, nonce: nonce, key: key);
}

/// crypto_secretbox_open_easy of a nonce-prefixed text message.
String decryptMessage(SodiumSumo sodium, String packed, Uint8List groupKey) {
  final key = SecureKey.fromList(sodium, groupKey);
  try {
    return utf8.decode(_openSecretBox(sodium, b64decode(packed), key));
  } finally {
    key.dispose();
  }
}

/// Same, binary payload (attachment bytes).
Uint8List decryptBytes(SodiumSumo sodium, String packed, Uint8List groupKey) {
  final key = SecureKey.fromList(sodium, groupKey);
  try {
    return _openSecretBox(sodium, b64decode(packed), key);
  } finally {
    key.dispose();
  }
}

// --- encrypt / seal side (mirrors the web e2ee.ts; random, so not KAT-frozen -
// covered by the round-trip test that decrypts with the proven functions above) ---

/// A fresh X25519 chat identity. Public key base64; private key stays on device.
({String publicKey, Uint8List privateKey}) generateIdentity(SodiumSumo sodium) {
  final kp = sodium.crypto.box.keyPair();
  try {
    return (publicKey: b64encode(kp.publicKey), privateKey: kp.secretKey.extractBytes());
  } finally {
    kp.secretKey.dispose();
  }
}

/// A fresh random secretbox key for a league's chat.
Uint8List generateGroupKey(SodiumSumo sodium) {
  final key = sodium.crypto.secretBox.keygen();
  try {
    return key.extractBytes();
  } finally {
    key.dispose();
  }
}

/// crypto_box_seal: wrap the group key to a member's public key (anonymous).
String sealGroupKey(SodiumSumo sodium, Uint8List groupKey, String recipientPublicKey) =>
    b64encode(sodium.crypto.box.seal(message: groupKey, publicKey: b64decode(recipientPublicKey)));

String _seal(SodiumSumo sodium, Uint8List message, Uint8List groupKey) {
  final key = SecureKey.fromList(sodium, groupKey);
  try {
    final nonce = sodium.randombytes.buf(sodium.crypto.secretBox.nonceBytes);
    final ct = sodium.crypto.secretBox.easy(message: message, nonce: nonce, key: key);
    return b64encode(Uint8List.fromList([...nonce, ...ct]));
  } finally {
    key.dispose();
  }
}

/// Encrypt a text message under the group key (nonce-prefixed secretbox).
String encryptMessage(SodiumSumo sodium, String plaintext, Uint8List groupKey) =>
    _seal(sodium, Uint8List.fromList(utf8.encode(plaintext)), groupKey);

/// Encrypt attachment bytes under the group key.
String encryptBytes(SodiumSumo sodium, Uint8List bytes, Uint8List groupKey) =>
    _seal(sodium, bytes, groupKey);

/// A high-entropy recovery code, grouped for readability (never user-chosen).
String generateRecoveryCode(SodiumSumo sodium) {
  final str = b64encode(sodium.randombytes.buf(18));
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
String wrapPrivateKeyWithRecovery(SodiumSumo sodium, Uint8List privateKey, String code) {
  final salt = sodium.randombytes.buf(sodium.crypto.pwhash.saltBytes);
  final key = _recoveryKey(sodium, code, salt);
  try {
    final nonce = sodium.randombytes.buf(sodium.crypto.secretBox.nonceBytes);
    final ct = sodium.crypto.secretBox.easy(message: privateKey, nonce: nonce, key: key);
    return b64encode(Uint8List.fromList([...salt, ...nonce, ...ct]));
  } finally {
    key.dispose();
  }
}

/// crypto_pwhash(Argon2id, INTERACTIVE) of the recovery code, then secretbox open -
/// recovers the identity private key on a new device from the recovery code.
Uint8List unwrapPrivateKeyWithRecovery(SodiumSumo sodium, String blob, String code) {
  final raw = b64decode(blob);
  final saltLen = sodium.crypto.pwhash.saltBytes;
  final salt = raw.sublist(0, saltLen);
  final rest = raw.sublist(saltLen); // nonce + ct

  final key = sodium.crypto.pwhash.call(
    outLen: sodium.crypto.secretBox.keyBytes,
    password: Int8List.fromList(utf8.encode(_normalizeCode(code))),
    salt: salt,
    opsLimit: sodium.crypto.pwhash.opsLimitInteractive,
    memLimit: sodium.crypto.pwhash.memLimitInteractive,
    alg: CryptoPwhashAlgorithm.argon2id13,
  );
  try {
    return _openSecretBox(sodium, rest, key);
  } finally {
    key.dispose();
  }
}
