import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/leagues/league_selection.dart';

void main() {
  group('selectedLeagueFor', () {
    test('reads the lens of the competition on screen', () {
      const map = {'wc2026': 'l1', 'euro2028': 'l2'};
      expect(selectedLeagueFor(map, 'wc2026'), 'l1');
      expect(selectedLeagueFor(map, 'euro2028'), 'l2');
      expect(selectedLeagueFor(map, 'copa2027'), isNull);
    });

    test('a null slug reads the default-competition lens', () {
      expect(selectedLeagueFor(const {defaultCompetitionKey: 'l9'}, null), 'l9');
      // Not the same bucket as any named competition.
      expect(selectedLeagueFor(const {'wc2026': 'l1'}, null), isNull);
    });
  });

  group('withLeagueSelection', () {
    test('sets one competition without touching the others', () {
      final next = withLeagueSelection(const {'wc2026': 'l1'}, 'euro2028', 'l2');
      expect(next, {'wc2026': 'l1', 'euro2028': 'l2'});
    });

    test('null clears only that competition', () {
      final next = withLeagueSelection(const {'wc2026': 'l1', 'euro2028': 'l2'}, 'wc2026', null);
      expect(next, {'euro2028': 'l2'});
    });

    test('does not mutate the map it was given', () {
      const before = {'wc2026': 'l1'};
      withLeagueSelection(before, 'wc2026', 'l2');
      expect(before, {'wc2026': 'l1'});
    });
  });

  group('pruneLeagueSelection', () {
    test('drops a lens on a league the user is no longer in', () {
      expect(pruneLeagueSelection(const {'wc2026': 'gone'}, 'wc2026', ['l1']), isEmpty);
    });

    test('keeps a lens that is still valid, and the identical map', () {
      const map = {'wc2026': 'l1'};
      expect(identical(pruneLeagueSelection(map, 'wc2026', ['l1', 'l2']), map), isTrue);
    });

    test('leaves other competitions alone when this one has no lens', () {
      const map = {'euro2028': 'l2'};
      expect(identical(pruneLeagueSelection(map, 'wc2026', const []), map), isTrue);
    });
  });

  group('encode / decode', () {
    test('round-trips', () {
      const map = {'wc2026': 'l1', defaultCompetitionKey: 'l9'};
      expect(decodeLeagueSelections(encodeLeagueSelections(map)), map);
    });

    test('tolerates nothing stored, junk, and wrong-typed values', () {
      expect(decodeLeagueSelections(null), isEmpty);
      expect(decodeLeagueSelections(''), isEmpty);
      expect(decodeLeagueSelections('not json'), isEmpty);
      expect(decodeLeagueSelections('["wc2026"]'), isEmpty);
      expect(decodeLeagueSelections('{"wc2026": 7, "euro2028": "l2", "copa": ""}'),
          {'euro2028': 'l2'});
    });
  });
}
