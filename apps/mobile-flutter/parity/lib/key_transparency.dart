import 'commitment.dart' show sha256Hex;

// Dart port of shared/key-transparency.ts (the chat public-key hash chain).
const ktGenesis = '0000000000000000000000000000000000000000000000000000000000000000';
const _ktPrefix = 'ngc-kt-v1:';

String computeKtEntryHash(Map l) =>
    sha256Hex(_ktPrefix + [l['seq'], l['prevHash'], l['userId'], l['publicKey'], l['createdAt']].join(':'));

Map<String, dynamic> verifyKtChain(List entries, [String genesis = ktGenesis]) {
  var prev = genesis;
  for (var i = 0; i < entries.length; i++) {
    final e = entries[i] as Map;
    if (e['seq'] != i) return {'ok': false, 'count': i, 'head': prev, 'failure': 'sequence'};
    if (e['prevHash'] != prev) return {'ok': false, 'count': i, 'head': prev, 'failure': 'link'};
    final h = computeKtEntryHash(e);
    if (h != e['entryHash']) return {'ok': false, 'count': i, 'head': prev, 'failure': 'entry-hash'};
    prev = h;
  }
  return {'ok': true, 'count': entries.length, 'head': prev};
}

String? loggedKeyFor(List entries, String userId) {
  for (var i = entries.length - 1; i >= 0; i--) {
    final e = entries[i] as Map;
    if (e['userId'] == userId) return e['publicKey'] as String;
  }
  return null;
}
