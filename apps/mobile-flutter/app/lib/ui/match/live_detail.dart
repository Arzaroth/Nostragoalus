/// Presentation helpers for the typed upstream live-match detail
/// ([Detail] in `api/models.gen.dart`, from `/api/matches/{id}/live-detail`).
library;

import '../../api/models.gen.dart';

/// Nothing worth a tab: no venue, no cards, no stats, no events.
bool liveDetailIsEmpty(Detail d) =>
    d.stadium == null &&
    d.attendance == null &&
    (d.cards.home.yellow + d.cards.home.red + d.cards.away.yellow + d.cards.away.red) == 0 &&
    liveTeamStats(d.stats?.home).isEmpty &&
    liveTeamStats(d.stats?.away).isEmpty &&
    d.goals.isEmpty &&
    d.bookings.isEmpty &&
    d.substitutions.isEmpty;

/// Stat key -> i18n key, in display order. The contract fixes the key set, so
/// every stat the feed can send has a label - nothing is dropped any more.
const liveStatLabels = <String, String>{
  'possession': 'match.possession',
  'attempts': 'match.attempts',
  'onTarget': 'match.onTarget',
  'passes': 'match.passes',
  'passesCompleted': 'match.passesCompleted',
  'crosses': 'match.crosses',
  'corners': 'match.corners',
  'fouls': 'match.fouls',
  'offsides': 'match.offsides',
  'distanceKm': 'match.distance',
  'pressuresApplied': 'match.pressures',
  'forcedTurnovers': 'match.turnovers',
};

/// One team's stats as `key -> value`, skipping the ones the feed left null.
Map<String, num> liveTeamStats(DetailStatHome? s) {
  if (s == null) return const {};
  return {
    for (final e in <String, num?>{
      'possession': s.possession,
      'attempts': s.attempts,
      'onTarget': s.onTarget,
      'passes': s.passes,
      'passesCompleted': s.passesCompleted,
      'crosses': s.crosses,
      'corners': s.corners,
      'fouls': s.fouls,
      'offsides': s.offsides,
      'distanceKm': s.distanceKm,
      'pressuresApplied': s.pressuresApplied,
      'forcedTurnovers': s.forcedTurnovers,
    }.entries)
      if (e.value != null) e.key: e.value!,
  };
}

/// `45+2` -> `45+2'`, null/empty -> `''`. One place so every event row agrees.
String liveMinuteLabel(String? minute) =>
    (minute == null || minute.isEmpty) ? '' : "$minute'";
