import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/token_store.dart' show SecureKv, FlutterSecureKv;
import '../chat/chat_crypto.dart';
import '../e2ee/e2ee.dart' as e2ee;
import '../state/providers.dart';
import 'key_transparency.dart';

/// How a served public key compares to the transparency log. `mismatch` is the
/// alarm: the server handed a key that is not the one publicly recorded.
enum KtCheck { ok, absent, mismatch, unknown }

/// Refusal to seal a key to a public key the log contradicts.
class KtKeyMismatch implements Exception {
  const KtKeyMismatch();
  @override
  String toString() => 'KtKeyMismatch: served key differs from the transparency log';
}

/// The verified key-transparency view: whether the server's log is a valid hash
/// chain AND matches the head it served, whether it broke append-only against
/// our pin, and this user's own safety number.
class KtView {
  const KtView({
    required this.verification,
    required this.entryCount,
    required this.headHash,
    required this.chainOk,
    required this.headTampered,
    required this.entries,
    this.mySafetyNumber,
  });
  final KtVerification verification;
  final int entryCount;

  /// The head we RECOMPUTED. Never the served one: displaying the server's own
  /// claim would let it pick the value the user compares out of band.
  final String headHash;

  /// The chain recomputes cleanly and agrees with the served head.
  final bool chainOk;

  /// The log shrank or an entry we pinned changed: an append-only violation.
  final bool headTampered;
  final List<dynamic> entries;
  final String? mySafetyNumber;

  KtCheck check(String userId, String publicKey) {
    if (!chainOk) return KtCheck.unknown;
    final logged = loggedKeyFor(entries, userId);
    if (logged == null) return KtCheck.absent;
    return logged == publicKey ? KtCheck.ok : KtCheck.mismatch;
  }
}

/// Where the pinned head lives (the platform keystore in the app, an in-memory
/// kv in tests).
final ktPinStoreProvider = Provider<SecureKv>((ref) => const FlutterSecureKv());

const _pinKey = 'ng_kt_head';

final ktProvider = FutureProvider<KtView>((ref) async {
  final sodium = await ref.watch(sodiumProvider.future);
  final api = ref.watch(apiProvider);
  final pins = ref.watch(ktPinStoreProvider);

  final raw = await api.keysLog();
  final entries = raw['entries'] as List;
  final verification = verifyKtChain(entries);
  final head = raw['head'];
  // An empty log verifies as a chain, so `verification.ok` alone would green-badge
  // an absent log or a self-consistent chain under a head of the server's choosing.
  final chainOk = verification.ok && head is Map && head['hash'] == verification.head;

  var headTampered = false;
  final stored = await pins.read(_pinKey);
  final pin = stored == null ? null : jsonDecode(stored) as Map<String, dynamic>;
  final pinSize = (pin?['size'] as num?)?.toInt() ?? 0;
  // A size-0 pin anchors nothing (the log was empty when we pinned) and would
  // index entries[-1]; a genuine rewind from N>0 is still caught by the length.
  if (pin != null &&
      pinSize > 0 &&
      (entries.length < pinSize ||
          (entries[pinSize - 1] as Map)['entryHash'] != pin['hash'])) {
    headTampered = true;
  } else if (chainOk) {
    await pins.write(
        _pinKey, jsonEncode({'hash': verification.head, 'size': entries.length}));
  }

  // The safety number is a fingerprint of the PUBLIC key, so it's derivable from
  // the server's registered key without needing the local private key.
  final pub = (await api.chatIdentity()).identity?.publicKey;

  return KtView(
    verification: verification,
    entryCount: entries.length,
    headHash: verification.head,
    chainOk: chainOk,
    headTampered: headTampered,
    entries: entries,
    mySafetyNumber: pub == null ? null : e2ee.fingerprint(sodium, pub),
  );
});

/// `check(userId, publicKey)` against the verified log, for callers about to
/// seal a key to someone (DM creation) or to badge a peer's key state.
final ktCheckProvider = FutureProvider<KtCheck Function(String, String)>((ref) async {
  final view = await ref.watch(ktProvider.future);
  return view.check;
});
