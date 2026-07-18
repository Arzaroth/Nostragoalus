import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sodium/sodium_sumo.dart' hide SodiumSumoInit;
import 'package:sodium_libs/sodium_libs_sumo.dart' show SodiumSumoInit;

import '../api/token_store.dart' show SecureKv, FlutterSecureKv;

/// The on-device chat identity: public key (base64) + raw private key. The
/// private key never leaves the device except wrapped under a recovery code.
class ChatIdentity {
  const ChatIdentity(this.publicKey, this.privateKey);
  final String publicKey;
  final Uint8List privateKey;

  Map<String, dynamic> get asMap => {'publicKey': publicKey, 'privateKey': privateKey};
}

/// libsodium (sumo), initialised once for the app.
final sodiumProvider = FutureProvider<SodiumSumo>((ref) => SodiumSumoInit.init());

/// Keystore-backed persistence for the chat identity keypair.
class ChatKeyStore {
  ChatKeyStore([SecureKv? kv]) : _kv = kv ?? const FlutterSecureKv();
  final SecureKv _kv;
  static const _pub = 'ng_chat_pub';
  static const _priv = 'ng_chat_priv';

  Future<ChatIdentity?> load() async {
    final pub = await _kv.read(_pub);
    final priv = await _kv.read(_priv);
    if (pub == null || priv == null) return null;
    return ChatIdentity(pub, base64Decode(priv));
  }

  Future<void> save(ChatIdentity id) async {
    await _kv.write(_pub, id.publicKey);
    await _kv.write(_priv, base64Encode(id.privateKey));
  }
}

final chatKeyStoreProvider = Provider<ChatKeyStore>((ref) => ChatKeyStore());
