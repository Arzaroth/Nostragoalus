// Dart port of computeConsensus from server/utils/bot/service.ts (the crowd
// consensus scoreline). Operates on JSON-shaped maps. Goal counts are >= 0, so
// Dart's .round() (half away from zero) matches JS Math.round on the mean.

const minConsensusUsers = 5;

Map<String, dynamic>? computeConsensus(List rows, String method) {
  final rs = rows.cast<Map>();
  if (rs.isEmpty) return null;

  if (method == 'MEAN') {
    final home = (rs.fold<num>(0, (s, r) => s + (r['home'] as num)) / rs.length).round();
    final away = (rs.fold<num>(0, (s, r) => s + (r['away'] as num)) / rs.length).round();
    final count = rs.where((r) => r['home'] == home && r['away'] == away).length;
    return {'home': home, 'away': away, 'count': count, 'total': rs.length};
  }

  if (rs.length < minConsensusUsers) return null;
  final counts = <String, Map<String, dynamic>>{};
  for (final r in rs) {
    final key = '${r['home']}-${r['away']}';
    final entry = counts[key];
    if (entry != null) {
      entry['count'] += 1;
    } else {
      counts[key] = {'home': r['home'], 'away': r['away'], 'count': 1};
    }
  }
  final best = counts.values.toList()
    ..sort((a, b) {
      final byCount = (b['count'] as num) - (a['count'] as num);
      if (byCount != 0) return byCount > 0 ? 1 : -1;
      final bySum = ((a['home'] as num) + (a['away'] as num)) - ((b['home'] as num) + (b['away'] as num));
      if (bySum != 0) return bySum > 0 ? 1 : -1;
      final byHome = (b['home'] as num) - (a['home'] as num);
      return byHome == 0 ? 0 : (byHome > 0 ? 1 : -1);
    });
  final b = best.first;
  return {'home': b['home'], 'away': b['away'], 'count': b['count'], 'total': rs.length};
}
