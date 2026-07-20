// Dart port of server/utils/scoring/{engine,tiers,bonus}.ts - the pure scoring
// core. Operates on JSON-shaped maps/lists so a frozen vector replays through it
// with no model layer. Rules arrive as a frozen arg (a Map); no config defaults
// are needed here. Must stay byte-for-byte identical to the TS source.

String outcomeOf(Map s) {
  final h = s['home'] as num, a = s['away'] as num;
  if (h > a) return 'HOME';
  if (h < a) return 'AWAY';
  return 'DRAW';
}

num _goalDiff(Map s) => (s['home'] as num) - (s['away'] as num);

String classifyTier(Map pred, Map actual) {
  if (pred['home'] == actual['home'] && pred['away'] == actual['away']) return 'EXACT';
  if (outcomeOf(pred) != outcomeOf(actual)) return 'MISS';
  if (_goalDiff(pred) == _goalDiff(actual)) return 'DIFF';
  return 'OUTCOME';
}

num basePointsFor(String tier, Map base) {
  switch (tier) {
    case 'EXACT':
      return base['exact'] as num;
    case 'DIFF':
      return base['diff'] as num;
    case 'OUTCOME':
      return base['outcome'] as num;
    default:
      return base['miss'] as num;
  }
}

bool predictionHits(Map pred, Map actual, bool byExact) => byExact
    ? pred['home'] == actual['home'] && pred['away'] == actual['away']
    : outcomeOf(pred) == outcomeOf(actual);

// crowd/odds rarity bonus - mirror bonus.ts.
Map<String, dynamic> crowdBonus(bool hit, num matchCount, num total, List tiers, num minDenominator) {
  if (!hit) return {'bonus': 0, 'share': null};
  if (total <= 0 || total < minDenominator) return {'bonus': 0, 'share': null};

  final share = matchCount / total;
  final sorted = [...tiers.cast<Map>()]..sort((a, b) => (a['maxShareExclusive'] as num).compareTo(b['maxShareExclusive'] as num));
  for (final tier in sorted) {
    if (share < (tier['maxShareExclusive'] as num)) return {'bonus': tier['bonus'], 'share': share};
  }
  return {'bonus': 0, 'share': share};
}

num oddsBonus(bool hit, num? decimalOdds, List? tiers) {
  if (!hit || decimalOdds == null || tiers == null || tiers.isEmpty) return 0;
  final sorted = [...tiers.cast<Map>()]..sort((a, b) => (b['minDecimalOdds'] as num).compareTo(a['minDecimalOdds'] as num));
  for (final tier in sorted) {
    if (decimalOdds >= (tier['minDecimalOdds'] as num)) return tier['bonus'] as num;
  }
  return 0;
}

Map<String, dynamic> computeBonus(Map pred, Map actual, Map rules, Map hist, num? actualOutcomeOdds) {
  if (rules['bonusSource'] == 'CROWD') {
    final byExact = rules['crowdMatchBasis'] == 'EXACT';
    final hit = predictionHits(pred, actual, byExact);
    final matchCount = (byExact ? hist['exactCount'] : hist['outcomeCount']) as num;
    final pool = (byExact ? hist['outcomeCount'] : hist['total']) as num;
    final res = crowdBonus(hit, matchCount, pool, rules['crowdTiers'] as List, rules['crowdMinDenominator'] as num);
    final bonus = res['bonus'] as num;
    final share = res['share'];

    final outcomeTiers = rules['crowdOutcomeTiers'];
    final outcomeBonus = (byExact && outcomeTiers is List && outcomeTiers.isNotEmpty)
        ? crowdBonus(
            predictionHits(pred, actual, false),
            hist['outcomeCount'] as num,
            hist['total'] as num,
            outcomeTiers,
            rules['crowdMinDenominator'] as num,
          )['bonus'] as num
        : 0;

    final resultLayerOnly = bonus == 0 && outcomeBonus > 0;
    return {'bonus': bonus + outcomeBonus, 'source': 'CROWD', 'share': resultLayerOnly ? null : share};
  }

  if (rules['bonusSource'] == 'ODDS') {
    final byExact = rules['oddsAppliesTo'] == 'EXACT';
    final hit = predictionHits(pred, actual, byExact);
    return {'bonus': oddsBonus(hit, actualOutcomeOdds, rules['oddsTiers'] as List?), 'source': 'ODDS', 'share': null};
  }

  return {'bonus': 0, 'source': 'NONE', 'share': null};
}

Map<String, dynamic> buildHistogram(Map actual, List predictions) {
  var exactCount = 0, outcomeCount = 0;
  for (final p in predictions.cast<Map>()) {
    if (predictionHits(p, actual, true)) exactCount += 1;
    if (predictionHits(p, actual, false)) outcomeCount += 1;
  }
  return {'exactCount': exactCount, 'outcomeCount': outcomeCount, 'total': predictions.length, 'actualOutcome': outcomeOf(actual)};
}

Map<String, dynamic> _scoreOne(Map input, Map hist, Map p) {
  final pred = {'home': p['home'], 'away': p['away']};
  final actual = input['actual'] as Map;
  final rules = input['rules'] as Map;
  final baseTier = classifyTier(pred, actual);
  final basePoints = basePointsFor(baseTier, rules['base'] as Map);
  final b = computeBonus(pred, actual, rules, hist, (input['actualOutcomeOdds'] as num?));
  final bonus = b['bonus'] as num;

  final multiplier = (p['isJoker'] == true || input['forceJoker'] == true) ? rules['jokerMultiplier'] as num : 1;
  final scalable = rules['jokerAppliesToBonus'] == true ? basePoints + bonus : basePoints;
  final fixed = rules['jokerAppliesToBonus'] == true ? 0 : bonus;
  // .round() is half-away-from-zero, JS Math.round is half-up; they only differ
  // on a negative .5, which scoring/schema.ts:22-28 rules out (base points min 0,
  // jokerMultiplier min 1).
  final totalPoints = (scalable * multiplier + fixed).round();

  return {
    'id': p['id'],
    'baseTier': baseTier,
    'basePoints': basePoints,
    'bonusPoints': bonus,
    'bonusSource': b['source'],
    'crowdShare': b['share'],
    'jokerMultiplier': multiplier,
    'totalPoints': totalPoints,
  };
}

List scorePredictions(Map input) {
  final hist = buildHistogram(input['actual'] as Map, input['predictions'] as List);
  return (input['predictions'] as List).cast<Map>().map((p) => _scoreOne(input, hist, p)).toList();
}

Map<String, dynamic> scoreSyntheticPrediction(Map input, Map p) =>
    _scoreOne(input, buildHistogram(input['actual'] as Map, input['predictions'] as List), p);
