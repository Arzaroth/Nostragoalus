import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/models.gen.dart';

void main() {
  test('CompetitionsResponse parses a nested list', () {
    final r = CompetitionsResponse.fromJson({
      'competitions': [
        {'id': 'wc', 'slug': 'world-cup', 'name': 'World Cup'},
        {'id': 'eu', 'slug': 'euro', 'name': 'Euro'},
      ],
    });

    expect(r.competitions, hasLength(2));
    expect(r.competitions.first.slug, 'world-cup');
    expect(r.competitions.last.name, 'Euro');
  });

  test('PredictionInput round-trips through JSON', () {
    const input = PredictionInput(home: 2, away: 1, isOutcomeOnly: false, wager: 3);
    final round = PredictionInput.fromJson(input.toJson());

    expect(round.home, 2);
    expect(round.away, 1);
    expect(round.isOutcomeOnly, false);
    expect(round.wager, 3);
  });

  test('PredictionInput omits nothing and keeps nulls for optional fields', () {
    const input = PredictionInput(home: 0, away: 0);
    final json = input.toJson();

    expect(json['home'], 0);
    expect(json['isOutcomeOnly'], isNull);
    expect(json['wager'], isNull);
  });

  test('TrustStatusResponse parses a scalar', () {
    expect(TrustStatusResponse.fromJson({'trusted': true}).trusted, isTrue);
  });
}
