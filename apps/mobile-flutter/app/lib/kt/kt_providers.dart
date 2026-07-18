import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../chat/chat_crypto.dart';
import '../e2ee/e2ee.dart' as e2ee;
import '../state/providers.dart';
import 'key_transparency.dart';

/// The verified key-transparency view: whether the server's log is a valid hash
/// chain, and this user's own safety number (fingerprint of their public key).
class KtView {
  const KtView({
    required this.verification,
    required this.entryCount,
    required this.headHash,
    this.mySafetyNumber,
  });
  final KtVerification verification;
  final int entryCount;
  final String headHash;
  final String? mySafetyNumber;
}

final ktProvider = FutureProvider<KtView>((ref) async {
  final sodium = await ref.watch(sodiumProvider.future);
  final api = ref.watch(apiProvider);

  final raw = await api.keysLog();
  final entries = raw['entries'] as List;
  final verification = verifyKtChain(entries);
  final head = raw['head'];
  final headHash = (head is Map ? head['hash'] as String? : null) ?? verification.head;

  // The safety number is a fingerprint of the PUBLIC key, so it's derivable from
  // the server's registered key without needing the local private key.
  final pub = (await api.chatIdentity()).identity?.publicKey;

  return KtView(
    verification: verification,
    entryCount: entries.length,
    headHash: headHash,
    mySafetyNumber: pub == null ? null : e2ee.fingerprint(sodium, pub),
  );
});
