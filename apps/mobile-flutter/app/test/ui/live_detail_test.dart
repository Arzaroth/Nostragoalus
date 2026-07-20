import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/models.gen.dart';
import 'package:nostragoalus/ui/match/live_detail.dart';

DetailStatHome _stats({double? attempts, double? passesCompleted}) => DetailStatHome(
      possession: null,
      attempts: attempts,
      onTarget: null,
      passes: null,
      passesCompleted: passesCompleted,
      crosses: null,
      corners: null,
      fouls: null,
      offsides: null,
      distanceKm: null,
      pressuresApplied: null,
      forcedTurnovers: null,
    );

Detail _detail({
  String? stadium,
  double? attendance,
  DetailCardHome home = const DetailCardHome(yellow: 0, red: 0),
  DetailCardHome away = const DetailCardHome(yellow: 0, red: 0),
  DetailStat? stats,
  List<DetailGoal> goals = const [],
}) =>
    Detail(
      possessionHome: null,
      possessionAway: null,
      attendance: attendance,
      stadium: stadium,
      cards: DetailCard(home: home, away: away),
      goals: goals,
      bookings: const [],
      substitutions: const [],
      ifesId: null,
      homeTeamId: null,
      awayTeamId: null,
      stats: stats,
    );

void main() {
  test('an empty detail is recognised as nothing worth a tab', () {
    expect(liveDetailIsEmpty(_detail()), isTrue);
  });

  test('any one signal makes the detail non-empty', () {
    expect(liveDetailIsEmpty(_detail(stadium: 'Wembley')), isFalse);
    expect(liveDetailIsEmpty(_detail(attendance: 100)), isFalse);
    expect(
        liveDetailIsEmpty(_detail(home: const DetailCardHome(yellow: 1, red: 0))), isFalse);
    expect(
        liveDetailIsEmpty(
            _detail(stats: DetailStat(home: _stats(attempts: 3), away: null))),
        isFalse);
  });

  test('a stats block of nothing but nulls still counts as empty', () {
    expect(liveDetailIsEmpty(_detail(stats: DetailStat(home: _stats(), away: _stats()))), isTrue);
  });

  test('null stat keys are dropped, present ones keep their contract name', () {
    final m = liveTeamStats(_stats(attempts: 14, passesCompleted: 450));
    expect(m, {'attempts': 14, 'passesCompleted': 450});
    expect(liveTeamStats(null), isEmpty);
  });

  test('every stat key the contract can send has a label', () {
    final full = DetailStatHome(
      possession: 1, attempts: 1, onTarget: 1, passes: 1, passesCompleted: 1,
      crosses: 1, corners: 1, fouls: 1, offsides: 1, distanceKm: 1,
      pressuresApplied: 1, forcedTurnovers: 1,
    );
    expect(liveTeamStats(full).keys.toSet(), liveStatLabels.keys.toSet());
  });

  test('a minute renders with its tick, an absent one renders nothing', () {
    expect(liveMinuteLabel("45+2"), "45+2'");
    expect(liveMinuteLabel(null), '');
    expect(liveMinuteLabel(''), '');
  });
}
