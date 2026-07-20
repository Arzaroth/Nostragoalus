// Dart port of computeGroupStandings + its tiebreak ladder from
// server/utils/stats/standings.ts (with CLASSIC from tiebreakers.ts). Operates on
// JSON-shaped maps. The terminal name tie-break is a code-unit compare on BOTH
// stacks (the TS side dropped localeCompare for `<`/`>` so no locale data is
// needed here); every tie path terminates in that total name sort, so Dart's
// unstable List.sort cannot change the final order.

const classic = ['points', 'gd', 'gf'];

bool _matchCounts(Map m, bool includeLive) {
  if (m['fullTimeHome'] == null || m['fullTimeAway'] == null) return false;
  final s = m['status'];
  return s == 'FINISHED' || (includeLive && (s == 'LIVE' || s == 'PAUSED'));
}

bool _isH2H(String c) => c == 'h2h-points' || c == 'h2h-gd' || c == 'h2h-gf';

num _overallValue(Map row, String crit) {
  switch (crit) {
    case 'points':
      return row['points'] as num;
    case 'gd':
      return row['gd'] as num;
    case 'gf':
      return row['gf'] as num;
    case 'wins':
      return row['won'] as num;
    default:
      return 0;
  }
}

num _h2hValue(Map h, String crit) {
  if (crit == 'h2h-points') return h['points'] as num;
  if (crit == 'h2h-gd') return (h['gf'] as num) - (h['ga'] as num);
  return h['gf'] as num;
}

Map<String, Map<String, num>> _h2hStats(Set<String> names, List matches, bool includeLive) {
  final stats = <String, Map<String, num>>{};
  for (final n in names) {
    stats[n] = {'points': 0, 'gf': 0, 'ga': 0};
  }
  for (final m in matches.cast<Map>()) {
    if (!names.contains(m['homeTeam']) || !names.contains(m['awayTeam'])) continue;
    if (!_matchCounts(m, includeLive)) continue;
    final h = stats[m['homeTeam']]!, a = stats[m['awayTeam']]!;
    final fh = m['fullTimeHome'] as num, fa = m['fullTimeAway'] as num;
    h['gf'] = h['gf']! + fh;
    h['ga'] = h['ga']! + fa;
    a['gf'] = a['gf']! + fa;
    a['ga'] = a['ga']! + fh;
    if (fh > fa) {
      h['points'] = h['points']! + 3;
    } else if (fh < fa) {
      a['points'] = a['points']! + 3;
    } else {
      h['points'] = h['points']! + 1;
      a['points'] = a['points']! + 1;
    }
  }
  return stats;
}

List<List<Map>> _bucketByValue(List<Map> teams, num Function(Map) valueOf) {
  final sorted = [...teams]..sort((a, b) => valueOf(b).compareTo(valueOf(a)));
  final buckets = <List<Map>>[];
  for (final t in sorted) {
    final last = buckets.isNotEmpty ? buckets.last : null;
    if (last != null && valueOf(last[0]) == valueOf(t)) {
      last.add(t);
    } else {
      buckets.add([t]);
    }
  }
  return buckets;
}

List<Map> _rankTied(List<Map> teams, List matches, bool includeLive, List<String> criteria) {
  List<Map> applyFrom(List<Map> group, int idx) {
    if (group.length <= 1) return group;
    if (idx >= criteria.length) {
      return [...group]..sort((a, b) => (a['name'] as String).compareTo(b['name'] as String));
    }

    if (_isH2H(criteria[idx])) {
      var end = idx;
      while (end < criteria.length && _isH2H(criteria[end])) {
        end++;
      }
      final h = _h2hStats(group.map((t) => t['name'] as String).toSet(), matches, includeLive);
      var parts = <List<Map>>[group];
      for (var i = idx; i < end; i++) {
        parts = [for (final p in parts) ..._bucketByValue(p, (t) => _h2hValue(h[t['name']]!, criteria[i]))];
      }
      if (parts.length == 1) return applyFrom(group, end);
      return [for (final p in parts) ...(p.length > 1 ? applyFrom(p, idx) : p)];
    }

    final parts = _bucketByValue(group, (t) => _overallValue(t, criteria[idx]));
    return [for (final p in parts) ...(p.length > 1 ? applyFrom(p, idx + 1) : p)];
  }

  return applyFrom(teams, 0);
}

List computeGroupStandings(List matches, [Map? opts]) {
  final includeLive = opts?['includeLive'] == true;
  final criteria = (opts?['tiebreakers'] as List?)?.cast<String>() ?? classic;

  final table = <String, Map<String, dynamic>>{};
  Map<String, dynamic> ensure(String name, dynamic code) => table.putIfAbsent(name,
      () => {'code': code, 'name': name, 'played': 0, 'won': 0, 'drawn': 0, 'lost': 0, 'gf': 0, 'ga': 0, 'gd': 0, 'points': 0});

  for (final m in matches.cast<Map>()) {
    final home = ensure(m['homeTeam'] as String, m['homeTeamCode']);
    final away = ensure(m['awayTeam'] as String, m['awayTeamCode']);
    if (!_matchCounts(m, includeLive)) continue;
    final fh = m['fullTimeHome'] as num, fa = m['fullTimeAway'] as num;

    home['played'] += 1;
    away['played'] += 1;
    home['gf'] += fh;
    home['ga'] += fa;
    away['gf'] += fa;
    away['ga'] += fh;

    if (fh > fa) {
      home['won'] += 1;
      away['lost'] += 1;
      home['points'] += 3;
    } else if (fh < fa) {
      away['won'] += 1;
      home['lost'] += 1;
      away['points'] += 3;
    } else {
      home['drawn'] += 1;
      away['drawn'] += 1;
      home['points'] += 1;
      away['points'] += 1;
    }
  }

  for (final row in table.values) {
    row['gd'] = (row['gf'] as num) - (row['ga'] as num);
  }

  return _rankTied(table.values.toList(), matches, includeLive, criteria);
}
