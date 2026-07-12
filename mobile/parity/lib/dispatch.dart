import 'commitment.dart' as c;
import 'key_transparency.dart' as kt;
import 'match_logic.dart' as m;

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
    'verifyKtChain': (a) => kt.verifyKtChain(a[0] as List, a.length > 1 ? a[1] as String : kt.ktGenesis),
    'loggedKeyFor': (a) => kt.loggedKeyFor(a[0] as List, a[1] as String),
  },
  'match': {
    'matchIsInPlay': (a) => m.matchIsInPlay(a[0] as String),
    'matchHasStarted': (a) => m.matchHasStarted(a[0] as String),
    'isSingleMatchStage': (a) => m.isSingleMatchStage(a[0] as String?),
    'countsDouble': (a) => m.countsDouble(a[0] as String?),
    'isKnockout': (a) => m.isKnockout(a[0] as String?),
  },
};

// Vector files that exist on the TS side but whose Dart port is not wired yet.
// The runner skips them (loudly) rather than failing. To close one:
//   - e2ee:      add a libsodium binding (sodium_libs / sodium ffi) and port
//                app/utils/e2ee.ts; wire $b64 arg/result marshalling (see README).
//   - scoring:   port server/utils/scoring/engine.ts (+ tiers.ts, bonus.ts).
//   - fergie:    port server/utils/analytics/fergie.ts.
//   - standings: port server/utils/stats/standings.ts.
//   - consensus: port server/utils/bot/service.ts (computeConsensus only).
const notYetImplemented = {'e2ee', 'scoring', 'fergie', 'standings', 'consensus'};

dynamic dispatch(String module, String fn, List args) {
  final mod = registry[module];
  if (mod == null) throw StateError('parity: unknown module "$module"');
  final target = mod[fn];
  if (target == null) throw StateError('parity: unknown fn "$module.$fn"');
  return target(args);
}
