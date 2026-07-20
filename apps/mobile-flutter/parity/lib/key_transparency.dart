import 'commitment.dart' show sha256Hex;

export 'commitment.dart' show sha256Hex;

// Dart port of shared/key-transparency.ts (the chat public-key hash chain), the
// single copy the Flutter app also imports. Each entry commits to the previous
// head, so a server that ever substituted a user's key would break the chain
// (or, more subtly, show a different key than the one you verified out-of-band).
const ktGenesis = '0000000000000000000000000000000000000000000000000000000000000000';
const _ktPrefix = 'ngc-kt-v1:';

String computeKtEntryHash(Map l) =>
    sha256Hex(_ktPrefix + [l['seq'], l['prevHash'], l['userId'], l['publicKey'], l['createdAt']].join(':'));

/// Result of walking the chain: `ok` plus how far it got and where it broke.
class KtVerification {
  const KtVerification({required this.ok, required this.count, required this.head, this.failure});
  final bool ok;
  final int count;
  final String head;
  final String? failure;

  /// The shape the frozen vectors carry (`failure` absent when ok).
  Map<String, dynamic> toJson() => {
        'ok': ok,
        'count': count,
        'head': head,
        if (failure != null) 'failure': failure,
      };
}

KtVerification verifyKtChain(List entries, [String genesis = ktGenesis]) {
  var prev = genesis;
  for (var i = 0; i < entries.length; i++) {
    final e = entries[i] as Map;
    if (e['seq'] != i) return KtVerification(ok: false, count: i, head: prev, failure: 'sequence');
    if (e['prevHash'] != prev) return KtVerification(ok: false, count: i, head: prev, failure: 'link');
    final h = computeKtEntryHash(e);
    if (h != e['entryHash']) {
      return KtVerification(ok: false, count: i, head: prev, failure: 'entry-hash');
    }
    prev = h;
  }
  return KtVerification(ok: true, count: entries.length, head: prev);
}

/// The most recent logged public key for a user (null if never logged).
String? loggedKeyFor(List entries, String userId) {
  for (var i = entries.length - 1; i >= 0; i--) {
    final e = entries[i] as Map;
    if (e['userId'] == userId) return e['publicKey'] as String;
  }
  return null;
}
