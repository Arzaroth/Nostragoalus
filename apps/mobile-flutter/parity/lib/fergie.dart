import 'scoring.dart' as scoring;

// Dart port of server/utils/analytics/fergie.ts (+ minuteValue from
// stats/insights.ts). Operates on JSON-shaped maps. The `oddsForOutcome`
// callback of the TS input cannot cross a frozen vector, so odds are always null
// here (the fergie vectors never score on ODDS); everything else is deterministic.

const _unknownMinute = 1000000000; // 1e9

final _minuteRe = RegExp(r'(\d+)(?:[^\d]*\+(\d+))?');

num minuteValue(String? minute) {
  if (minute == null || minute.isEmpty) return _unknownMinute;
  final m = _minuteRe.firstMatch(minute);
  if (m == null) return _unknownMinute;
  return int.parse(m.group(1)!) * 100 + (m.group(2) != null ? int.parse(m.group(2)!) : 0);
}

bool isAddedTime(String? minute) =>
    minute != null && minute.contains('+') && (minuteValue(minute) / 100).floor() >= 90;

Map<String, dynamic> _emptyFergie() => {
      'matches': 0,
      'goals': 0,
      'netPoints': 0,
      'pointsWon': 0,
      'pointsLost': 0,
      'biggestGain': null,
      'biggestLoss': null,
      'breakdown': [],
    };

num _realPoints(Map m, Map rules, Map at) {
  final scores = scoring.scorePredictions({
    'actual': at,
    'predictions': m['field'],
    'rules': rules,
    'actualOutcomeOdds': null,
    'forceJoker': m['forceJoker'],
  });
  for (final s in scores.cast<Map>()) {
    if (s['id'] == m['predId']) return s['totalPoints'] as num;
  }
  return 0;
}

Map<String, dynamic>? _replayMatch(Map m, Map rules) {
  final goals = (m['goals'] as List).cast<Map>();
  final ordered = [
    for (var i = 0; i < goals.length; i++)
      {'g': goals[i], 'order': minuteValue(goals[i]['minute'] as String?), 'i': i},
  ];
  if (ordered.any((o) => (o['order'] as num) >= _unknownMinute)) return null;
  // TS sorts with the stable Array.prototype.sort; Dart's List.sort is not
  // stable, so feed order is carried explicitly as the terminal tie-break.
  ordered.sort((a, b) {
    final byOrder = (a['order'] as num).compareTo(b['order'] as num);
    return byOrder != 0 ? byOrder : (a['i'] as int).compareTo(b['i'] as int);
  });
  final sorted = ordered.map((o) => o['g'] as Map).toList();

  var home = 0, away = 0;
  num gained = 0, lost = 0;
  var added = 0;
  for (final g in sorted) {
    final before = {'home': home, 'away': away};
    if (g['side'] == 'HOME') {
      home += 1;
    } else {
      away += 1;
    }
    if (!isAddedTime(g['minute'] as String?)) continue;
    added += 1;
    final after = {'home': home, 'away': away};
    if (m['isKnockout'] == true && scoring.outcomeOf(before) == 'DRAW') continue;
    final delta = _realPoints(m, rules, after) - _realPoints(m, rules, before);
    if (delta > 0) {
      gained += delta;
    } else if (delta < 0) {
      lost += -delta;
    }
  }
  final actual = m['actual'] as Map;
  if (home != actual['home'] || away != actual['away']) return null;
  if (added == 0) return null;

  final pred = m['pred'] as Map;
  return {
    'home': m['home'],
    'away': m['away'],
    'homeCode': m['homeCode'],
    'awayCode': m['awayCode'],
    'predicted': '${pred['home']}-${pred['away']}',
    'actual': '${actual['home']}-${actual['away']}',
    'gained': gained,
    'lost': lost,
    'net': gained - lost,
    'isJoker': m['isJoker'],
  };
}

Map<String, dynamic> computeFergie(List matches, Map rules) {
  final result = _emptyFergie();
  final breakdown = <Map<String, dynamic>>[];
  for (final m in matches.cast<Map>()) {
    final replay = _replayMatch(m, rules);
    if (replay == null) continue;
    final gained = replay['gained'] as num, lost = replay['lost'] as num;
    result['matches'] = (result['matches'] as num) + 1;
    result['goals'] = (result['goals'] as num) +
        (m['goals'] as List).cast<Map>().where((g) => isAddedTime(g['minute'] as String?)).length;
    result['pointsWon'] = (result['pointsWon'] as num) + gained;
    result['pointsLost'] = (result['pointsLost'] as num) + lost;

    final bg = result['biggestGain'] as Map?;
    if (gained > 0 && (bg == null || gained > (bg['gained'] as num))) result['biggestGain'] = replay;
    final bl = result['biggestLoss'] as Map?;
    if (lost > 0 && (bl == null || lost > (bl['lost'] as num))) result['biggestLoss'] = replay;

    if (gained > 0 || lost > 0) breakdown.add({'r': replay, 'i': breakdown.length});
  }
  result['netPoints'] = (result['pointsWon'] as num) - (result['pointsLost'] as num);
  // Same stability gap as the goal replay: TS keeps insertion order for entries
  // level on both keys, so the push index is the terminal tie-break here too.
  breakdown.sort((ea, eb) {
    final a = ea['r'] as Map, b = eb['r'] as Map;
    final byMove = ((b['gained'] as num) + (b['lost'] as num)) - ((a['gained'] as num) + (a['lost'] as num));
    if (byMove != 0) return byMove > 0 ? 1 : -1;
    final byLost = (b['lost'] as num) - (a['lost'] as num);
    if (byLost != 0) return byLost > 0 ? 1 : -1;
    return (ea['i'] as int).compareTo(eb['i'] as int);
  });
  result['breakdown'] = breakdown.map((e) => e['r']).toList();
  return result;
}
