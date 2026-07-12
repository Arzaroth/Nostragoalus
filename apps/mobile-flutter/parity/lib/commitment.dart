import 'dart:convert';
import 'package:crypto/crypto.dart';

// Dart port of shared/commitment.ts (the commit-reveal prediction ledger).
// Operates on JSON-shaped maps/lists so a frozen vector replays through it with
// no model layer. Must stay byte-for-byte identical to the TS source: the
// parity vectors are the proof.

const genesis = '0000000000000000000000000000000000000000000000000000000000000000';
const _subjectPrefix = 'ngc-subject-v1:';
const _commitPrefix = 'ngc-commit-v1:';
const _chainPrefix = 'ngc-chain-v1:';
const _leagueCommitPrefix = 'ngc-lcommit-v1:';
const _leagueChainPrefix = 'ngc-lchain-v1:';

String sha256Hex(String input) => sha256.convert(utf8.encode(input)).toString();

String computeSubject(String userId) => sha256Hex(_subjectPrefix + userId);

String computeCommitment(Map o) =>
    sha256Hex(_commitPrefix + [o['subject'], o['matchId'], o['homeGoals'], o['awayGoals'], o['salt']].join(':'));

String computeEntryHash(Map l) =>
    sha256Hex(_chainPrefix + [l['seq'], l['prevHash'], l['commitment'], l['subject'], l['matchId'], l['createdAt']].join(':'));

String computeLeagueCommitment(Map o) => sha256Hex(
    _leagueCommitPrefix + [o['subject'], o['leagueId'], o['matchId'], o['homeGoals'], o['awayGoals'], o['salt']].join(':'));

String computeLeagueEntryHash(Map l) => sha256Hex(_leagueChainPrefix +
    [l['seq'], l['prevHash'], l['commitment'], l['subject'], l['leagueId'], l['matchId'], l['createdAt']].join(':'));

Map<String, dynamic> _fail(int count, String head, int failedSeq, String reason) =>
    {'ok': false, 'count': count, 'head': head, 'failedSeq': failedSeq, 'reason': reason};

Map<String, dynamic> verifyLedger(List entries, [String expectedPrev = genesis]) {
  var prev = expectedPrev;
  int? expectedSeq;
  for (final e in entries.cast<Map>()) {
    if (expectedSeq != null && e['seq'] != expectedSeq) return _fail(entries.length, prev, e['seq'], 'sequence');
    if (e['prevHash'] != prev) return _fail(entries.length, prev, e['seq'], 'link');
    if (e['opened'] == true) {
      final commitment = computeCommitment(e);
      if (commitment != e['commitment']) return _fail(entries.length, prev, e['seq'], 'commitment');
    }
    final entryHash = computeEntryHash(e);
    if (entryHash != e['entryHash']) return _fail(entries.length, prev, e['seq'], 'entry-hash');
    prev = e['entryHash'];
    expectedSeq = (e['seq'] as int) + 1;
  }
  return {'ok': true, 'count': entries.length, 'head': prev};
}

Map<String, dynamic> verifyLeagueLedger(List entries, [String expectedPrev = genesis]) {
  var prev = expectedPrev;
  int? expectedSeq;
  for (final e in entries.cast<Map>()) {
    if (expectedSeq != null && e['seq'] != expectedSeq) return _fail(entries.length, prev, e['seq'], 'sequence');
    if (e['prevHash'] != prev) return _fail(entries.length, prev, e['seq'], 'link');
    if (e['opened'] == true) {
      final commitment = computeLeagueCommitment(e);
      if (commitment != e['commitment']) return _fail(entries.length, prev, e['seq'], 'commitment');
    }
    final entryHash = computeLeagueEntryHash(e);
    if (entryHash != e['entryHash']) return _fail(entries.length, prev, e['seq'], 'entry-hash');
    prev = e['entryHash'];
    expectedSeq = (e['seq'] as int) + 1;
  }
  return {'ok': true, 'count': entries.length, 'head': prev};
}

Map<String, dynamic> witnessExtension(Map? pin, List extension, Map servedHead) {
  if (pin == null) return {'status': 'first-seen', 'head': servedHead};
  if (servedHead['seq'] < pin['seq']) return {'status': 'rolled-back', 'head': pin};
  if (servedHead['seq'] == pin['seq']) {
    return servedHead['headHash'] == pin['headHash']
        ? {'status': 'consistent', 'head': servedHead}
        : {'status': 'tampered', 'head': pin};
  }
  final res = verifyLedger(extension, pin['headHash']);
  final contiguous = extension.isNotEmpty && (extension.first as Map)['seq'] == pin['seq'] + 1;
  if (res['ok'] != true || !contiguous || res['head'] != servedHead['headHash']) {
    return {'status': 'tampered', 'head': pin};
  }
  return {'status': 'consistent', 'head': servedHead};
}
