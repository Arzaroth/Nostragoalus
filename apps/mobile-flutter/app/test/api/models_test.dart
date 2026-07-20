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

  // The server's zod tells optional apart from nullable and 400s on an explicit
  // null for a plain `.optional()`, so the two must not encode alike.
  test('PredictionInput omits an optional field but emits a nullable one', () {
    const input = PredictionInput(home: 0, away: 0);
    final json = input.toJson();

    expect(json['home'], 0);
    // isOutcomeOnly is z.boolean().optional() - the key must be absent.
    expect(json.containsKey('isOutcomeOnly'), isFalse);
    // wager is z.number().nullable().optional() - null is a meaningful value
    // (it clears the stake), so the key stays.
    expect(json.containsKey('wager'), isTrue);
    expect(json['wager'], isNull);
  });

  test('CreateLeagueInput omits every unset optional field', () {
    final json = const CreateLeagueInput(competition: 'wc', name: 'Mine').toJson();

    expect(json, {'competition': 'wc', 'name': 'Mine'});
  });

  test('enum fields expose their contract values', () {
    expect(CreateLeagueInput.modeValues, contains('HARDCORE'));
    expect(CreateLeagueInput.visibilityValues, ['PRIVATE', 'PUBLIC']);
  });

  test('MatchTimelineResponse parses the event list', () {
    final r = MatchTimelineResponse.fromJson({
      'events': [
        {
          'kind': 'goal',
          'side': 'HOME',
          'minute': "23'",
          'playerName': 'A',
          'playerInName': null,
          'playerOutName': null,
          'periodKind': null,
          'text': null,
          'homeScore': 1,
          'awayScore': 0,
        },
      ],
    });

    expect(r.events.single.kind, 'goal');
    expect(r.events.single.homeScore, 1);
    expect(r.events.single.playerOutName, isNull);
  });

  test('TrustStatusResponse parses a scalar', () {
    expect(TrustStatusResponse.fromJson({'trusted': true}).trusted, isTrue);
  });
}
