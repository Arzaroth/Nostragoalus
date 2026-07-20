import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sodium/sodium_sumo.dart' hide SodiumSumoInit;
import 'package:sodium_libs/sodium_libs_sumo.dart' show SodiumSumoInit;

import '../api/models.gen.dart' show MyWrappedKey;
import '../api/token_store.dart' show SecureKv, FlutterSecureKv;
import '../e2ee/e2ee.dart' as e2ee;

/// The on-device chat identity: public key (base64) + the private key held in
/// libsodium's mlock'd memory. The private key never leaves the device except
/// wrapped under a recovery code.
class ChatIdentity {
  const ChatIdentity(this.publicKey, this.privateKey);
  final String publicKey;
  final SecureKey privateKey;
}

/// Raised when the identity we hold cannot open any key sealed to us: the
/// private key does not pair with the public key the server serves (a bad
/// recovery, or an identity reset on another device).
class ChatKeyMismatch implements Exception {
  const ChatKeyMismatch();
  @override
  String toString() => 'ChatKeyMismatch: this device key opens none of my wrapped keys';
}

/// libsodium (sumo), initialised once for the app.
final sodiumProvider = FutureProvider<SodiumSumo>((ref) => SodiumSumoInit.init());

/// Keystore-backed persistence for the chat identity keypair, namespaced per
/// signed-in user so two accounts on one device never share a private key.
class ChatKeyStore {
  ChatKeyStore([SecureKv? kv]) : _kv = kv ?? const FlutterSecureKv();
  final SecureKv _kv;

  static String _pub(String userId) => 'ng_chat_pub_$userId';
  static String _priv(String userId) => 'ng_chat_priv_$userId';
  // Which user's entries are on this device, so sign-out can clear them without
  // needing a live session to ask who is signing out.
  static const _current = 'ng_chat_uid';

  Future<ChatIdentity?> load(SodiumSumo sodium, String userId) async {
    final pub = await _kv.read(_pub(userId));
    final priv = await _kv.read(_priv(userId));
    if (pub == null || priv == null) return null;
    return ChatIdentity(pub, SecureKey.fromList(sodium, base64Decode(priv)));
  }

  Future<void> save(String userId, ChatIdentity id) async {
    await _kv.write(_pub(userId), id.publicKey);
    await _kv.write(_priv(userId), base64Encode(id.privateKey.extractBytes()));
    await _kv.write(_current, userId);
  }

  Future<void> clear(String userId) async {
    await _kv.delete(_pub(userId));
    await _kv.delete(_priv(userId));
    await _kv.delete(_current);
  }

  /// Drop the keypair of whoever last saved one here (sign-out on a shared device).
  Future<void> clearCurrent() async {
    final uid = await _kv.read(_current);
    if (uid != null) await clear(uid);
  }
}

final chatKeyStoreProvider = Provider<ChatKeyStore>((ref) => ChatKeyStore());

/// An attachment as the chat/DM attachment endpoints return it: the ciphertext
/// and the epoch whose group key opens it. No generated model covers these two
/// endpoints, and a `.toString()` on a missing field would decrypt as garbage.
class EncryptedBlob {
  const EncryptedBlob(this.ciphertext, this.epoch);
  final String ciphertext;
  final int epoch;

  factory EncryptedBlob.fromJson(Map<String, dynamic> json) =>
      EncryptedBlob(json['ciphertext'] as String, (json['epoch'] as num).toInt());
}

/// Unwrap every epoch key sealed to me into `epoch -> key`. Epochs that fail
/// individually are skipped (an old epoch sealed to a previous identity is
/// expected); nothing opening at all means the identity itself is wrong, which
/// is [ChatKeyMismatch] rather than a silently empty room.
Map<int, SecureKey> openEpochKeys(
  SodiumSumo sodium,
  ChatIdentity identity,
  List<MyWrappedKey> wrapped,
) {
  final keys = <int, SecureKey>{};
  for (final wk in wrapped) {
    try {
      keys[wk.epoch.toInt()] = e2ee.openGroupKey(sodium, wk.wrappedKey,
          publicKey: identity.publicKey, privateKey: identity.privateKey);
    } catch (_) {/* one epoch we cannot open; others may still work */}
  }
  if (keys.isEmpty && wrapped.isNotEmpty) throw const ChatKeyMismatch();
  return keys;
}
