import 'chat_content.dart' as cc;
import 'commitment.dart' as c;
import 'consensus.dart' as cons;
import 'fergie.dart' as fg;
import 'key_transparency.dart' as kt;
import 'match_logic.dart' as m;
import 'match_view.dart' as mv;
import 'scoring.dart' as sc;
import 'standings.dart' as st;

typedef Fn = dynamic Function(List args);

// Name -> Dart function, mirroring tests/parity/dispatch.ts. A vector replays
// through this table alone. Each entry unpacks the frozen args positionally, the
// same order the TS side froze them.
final Map<String, Map<String, Fn>> registry = {
  'commitment': {
    'sha256Hex': (a) => c.sha256Hex(a[0] as String),
    'computeSubject': (a) => c.computeSubject(a[0] as String),
    'computeCommitment': (a) => c.computeCommitment(a[0] as Map),
    'computeEntryHash': (a) => c.computeEntryHash(a[0] as Map),
    'verifyLedger': (a) => c.verifyLedger(a[0] as List, a.length > 1 ? a[1] as String : c.genesis),
    'witnessExtension': (a) => c.witnessExtension(a[0] as Map?, a[1] as List, a[2] as Map),
    'computeLeagueCommitment': (a) => c.computeLeagueCommitment(a[0] as Map),
    'computeLeagueEntryHash': (a) => c.computeLeagueEntryHash(a[0] as Map),
    'verifyLeagueLedger': (a) => c.verifyLeagueLedger(a[0] as List, a.length > 1 ? a[1] as String : c.genesis),
  },
  'key-transparency': {
    'computeKtEntryHash': (a) => kt.computeKtEntryHash(a[0] as Map),
    'verifyKtChain': (a) =>
        kt.verifyKtChain(a[0] as List, a.length > 1 ? a[1] as String : kt.ktGenesis).toJson(),
    'loggedKeyFor': (a) => kt.loggedKeyFor(a[0] as List, a[1] as String),
  },
  'match': {
    'matchIsInPlay': (a) => m.matchIsInPlay(a[0] as String),
    'matchHasStarted': (a) => m.matchHasStarted(a[0] as String),
    'isSingleMatchStage': (a) => m.isSingleMatchStage(a[0] as String?),
    'countsDouble': (a) => m.countsDouble(a[0] as String?),
    'isKnockout': (a) => m.isKnockout(a[0] as String?),
  },
  'scoring': {
    'scorePredictions': (a) => sc.scorePredictions(a[0] as Map),
    'computeBonus': (a) => sc.computeBonus(a[0] as Map, a[1] as Map, a[2] as Map, a[3] as Map, a[4] as num?),
    'buildHistogram': (a) => sc.buildHistogram(a[0] as Map, a[1] as List),
    'scoreSyntheticPrediction': (a) => sc.scoreSyntheticPrediction(a[0] as Map, a[1] as Map),
  },
  'fergie': {
    'computeFergie': (a) => fg.computeFergie(a[0] as List, a[1] as Map),
    'isAddedTime': (a) => fg.isAddedTime(a[0] as String?),
  },
  'standings': {
    'computeGroupStandings': (a) => st.computeGroupStandings(a[0] as List, a.length > 1 ? a[1] as Map? : null),
  },
  'consensus': {
    'computeConsensus': (a) => cons.computeConsensus(a[0] as List, a[1] as String),
  },
  'chat-content': {
    'parseChatContent': (a) => cc.parseChatContent(a[0] as String).map((t) => t.toJson()).toList(),
    'extractMentions': (a) => cc.extractMentions(a[0] as String),
    'encodeMentions': (a) => cc.encodeMentions(
          a[0] as String,
          [
            for (final m in a[1] as List)
              (userId: (m as Map)['userId'] as String, name: m['name'] as String),
          ],
        ),
    'decodeMentions': (a) => cc.decodeMentions(
          a[0] as String,
          (a[1] as Map).map((k, v) => MapEntry(k as String, v as String)),
          a[2] as String,
        ),
  },
  'match-view': {
    'pbpTextSpec': (a) {
      final e = a[0] as Map;
      return mv
          .pbpTextSpec(
            kind: e['kind'] as String,
            playerName: e['playerName'] as String?,
            playerInName: e['playerInName'] as String?,
            playerOutName: e['playerOutName'] as String?,
            periodKind: e['periodKind'] as String?,
            text: e['text'] as String?,
          )
          .toJson();
    },
    'timelineIcon': (a) => mv.timelineIcons[a[0] as String],
    'isGoalKind': (a) => mv.isGoalKind(a[0] as String),
    'formatPlayerName': (a) => mv.formatPlayerName(a[0] as String?),
  },
};

// Vector files whose Dart port is not wired into THIS (pure, sync) runner. The
// runner skips them loudly rather than failing.
//   - e2ee: ported in lib/e2ee.dart and replayed by test/e2ee_interop_test.dart
//     (needs libsodium; async, so it lives in its own test not this sync dispatch).
// Everything else (scoring / fergie / standings / consensus) is now wired above.
const notYetImplemented = {'e2ee'};

dynamic dispatch(String module, String fn, List args) {
  final mod = registry[module];
  if (mod == null) throw StateError('parity: unknown module "$module"');
  final target = mod[fn];
  if (target == null) throw StateError('parity: unknown fn "$module.$fn"');
  return target(args);
}
