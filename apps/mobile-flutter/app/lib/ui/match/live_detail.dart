/// Local typing for the upstream live-match blob. The endpoint is not in the
/// OpenAPI snapshot yet (see `deferred-match-ui.md`), so the shape is asserted
/// here once instead of being string-poked at every render site.
library;

class LiveDetailEvent {
  const LiveDetailEvent({this.minute, this.player, this.detail});

  final String? minute;
  final String? player;
  final String? detail;

  static LiveDetailEvent goal(Map<String, dynamic> j) => LiveDetailEvent(
        minute: _str(j['minute']) ?? _str(j['time']),
        player: _str(j['scorer']) ?? _str(j['player']) ?? _str(j['playerName']),
      );

  static LiveDetailEvent booking(Map<String, dynamic> j) => LiveDetailEvent(
        minute: _str(j['minute']) ?? _str(j['time']),
        player: _str(j['player']) ?? _str(j['playerName']),
        detail: _str(j['card']) ?? _str(j['type']),
      );

  static LiveDetailEvent substitution(Map<String, dynamic> j) => LiveDetailEvent(
        minute: _str(j['minute']) ?? _str(j['time']),
        player: _str(j['playerIn']) ?? _str(j['playerInName']),
        detail: _str(j['playerOut']) ?? _str(j['playerOutName']),
      );
}

class LiveDetailCards {
  const LiveDetailCards({
    required this.homeYellow,
    required this.awayYellow,
    required this.homeRed,
    required this.awayRed,
  });

  final int homeYellow;
  final int awayYellow;
  final int homeRed;
  final int awayRed;

  bool get isEmpty => homeYellow == 0 && awayYellow == 0 && homeRed == 0 && awayRed == 0;

  static LiveDetailCards? fromJson(Object? raw) {
    final m = _map(raw);
    if (m == null) return null;
    final home = _map(m['home']) ?? const {};
    final away = _map(m['away']) ?? const {};
    return LiveDetailCards(
      homeYellow: _int(home['yellow']),
      awayYellow: _int(away['yellow']),
      homeRed: _int(home['red']),
      awayRed: _int(away['red']),
    );
  }
}

class LiveDetail {
  const LiveDetail({
    this.stadium,
    this.attendance,
    this.cards,
    this.homeStats = const {},
    this.awayStats = const {},
    this.goals = const [],
    this.bookings = const [],
    this.substitutions = const [],
  });

  final String? stadium;
  final String? attendance;
  final LiveDetailCards? cards;
  final Map<String, num> homeStats;
  final Map<String, num> awayStats;
  final List<LiveDetailEvent> goals;
  final List<LiveDetailEvent> bookings;
  final List<LiveDetailEvent> substitutions;

  bool get isEmpty =>
      stadium == null &&
      (cards?.isEmpty ?? true) &&
      homeStats.isEmpty &&
      awayStats.isEmpty &&
      goals.isEmpty &&
      bookings.isEmpty &&
      substitutions.isEmpty;

  factory LiveDetail.fromJson(Map<String, dynamic> json) {
    final stats = _map(json['stats']);
    return LiveDetail(
      stadium: _str(json['stadium']),
      attendance: _str(json['attendance']),
      cards: LiveDetailCards.fromJson(json['cards']),
      homeStats: _stats(stats?['home']),
      awayStats: _stats(stats?['away']),
      goals: _list(json['goals'], LiveDetailEvent.goal),
      bookings: _list(json['bookings'], LiveDetailEvent.booking),
      substitutions: _list(json['substitutions'], LiveDetailEvent.substitution),
    );
  }
}

/// Feed stat key -> i18n key. Keys we have no label for are dropped rather than
/// shown raw (a five-locale app must not render `pressuresApplied` as a label).
const liveStatLabels = <String, String>{
  'attempts': 'match.attempts',
  'onTarget': 'match.onTarget',
  'passes': 'match.passes',
  'crosses': 'match.crosses',
  'corners': 'match.corners',
  'fouls': 'match.fouls',
  'offsides': 'match.offsides',
  'distanceKm': 'match.distance',
  'pressuresApplied': 'match.pressures',
  'forcedTurnovers': 'match.turnovers',
  'possession': 'match.possession',
};

Map<String, num> _stats(Object? raw) {
  final m = _map(raw);
  if (m == null) return const {};
  return {
    for (final e in m.entries)
      if (e.value is num) e.key: e.value as num,
  };
}

List<LiveDetailEvent> _list(
  Object? raw,
  LiveDetailEvent Function(Map<String, dynamic>) build,
) {
  if (raw is! List) return const [];
  return [
    for (final e in raw)
      if (_map(e) case final m?) build(m),
  ];
}

Map<String, dynamic>? _map(Object? v) => v is Map ? v.cast<String, dynamic>() : null;

String? _str(Object? v) {
  if (v == null) return null;
  final s = v.toString();
  return s.isEmpty ? null : s;
}

int _int(Object? v) => v is num ? v.toInt() : 0;
