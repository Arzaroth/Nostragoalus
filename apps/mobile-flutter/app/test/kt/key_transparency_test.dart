import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/kt/key_transparency.dart';

Map<String, dynamic> entry(int seq, String prev, String userId, String pub, String created) {
  final e = {
    'seq': seq,
    'prevHash': prev,
    'userId': userId,
    'publicKey': pub,
    'createdAt': created,
  };
  return {...e, 'entryHash': computeKtEntryHash(e)};
}

void main() {
  test('a well-formed chain verifies', () {
    final e0 = entry(0, ktGenesis, 'u1', 'k1', 't0');
    final e1 = entry(1, e0['entryHash'] as String, 'u1', 'k2', 't1');
    final v = verifyKtChain([e0, e1]);
    expect(v.ok, isTrue);
    expect(v.count, 2);
  });

  test('a broken link fails at the right entry', () {
    final e0 = entry(0, ktGenesis, 'u1', 'k1', 't0');
    final e1 = entry(1, e0['entryHash'] as String, 'u1', 'k2', 't1');
    final v = verifyKtChain([e0, {...e1, 'prevHash': 'deadbeef'}]);
    expect(v.ok, isFalse);
    expect(v.failure, 'link');
    expect(v.count, 1);
  });

  test('a substituted key (stale hash) is caught', () {
    final e0 = entry(0, ktGenesis, 'u1', 'k1', 't0');
    final tampered = {...e0, 'publicKey': 'evil-key'}; // entryHash no longer matches
    final v = verifyKtChain([tampered]);
    expect(v.ok, isFalse);
    expect(v.failure, 'entry-hash');
  });

  test('loggedKeyFor returns the most recent key for a user', () {
    final e0 = entry(0, ktGenesis, 'u1', 'k1', 't0');
    final e1 = entry(1, e0['entryHash'] as String, 'u1', 'k2', 't1');
    expect(loggedKeyFor([e0, e1], 'u1'), 'k2');
    expect(loggedKeyFor([e0, e1], 'nobody'), isNull);
  });
}
