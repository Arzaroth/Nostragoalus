import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/api.dart';
import 'package:nostragoalus/api/models.gen.dart';

import 'build_client.dart';
import 'helpers.dart';

void main() {
  group('the account-wide pick', () {
    test('savePredictionGlobal PUTs /api/predictions with the match in the body', () async {
      final (api, adapter) = buildApi([Reply(200, const {'id': 'p1'})]);

      final res = await api.savePredictionGlobal(
          'm1', const PredictionInput(home: 2, away: 1, isOutcomeOnly: false));

      expect(res.id, 'p1');
      // `wager` is nullable AND optional server-side, so an explicit null is
      // what the schema accepts; only plain-optional fields are omitted.
      expectRequest(adapter, method: 'PUT', path: '/api/predictions', body: {
        'matchId': 'm1',
        'home': 2,
        'away': 1,
        'isOutcomeOnly': false,
        'wager': null,
      });
    });

    // The route is the whole point of the method: the per-league one 400s with
    // "per-league picks are only available in easy, hard and hardcore leagues".
    test('savePredictionGlobal never uses a league-scoped path', () async {
      final (api, adapter) = buildApi([Reply(200, const {'id': 'p1'})]);
      await api.savePredictionGlobal('m1', const PredictionInput(home: 0, away: 0));
      expect(adapter.requests.single.path, isNot(contains('/leagues/')));
    });

    test('setJokerGlobal PUTs /api/predictions/joker', () async {
      final (api, adapter) = buildApi([Reply(200, const {'ok': true})]);

      await api.setJokerGlobal('m1', true);

      expectRequest(adapter,
          method: 'PUT',
          path: '/api/predictions/joker',
          body: {'matchId': 'm1', 'isJoker': true});
    });

    test('a rejected save surfaces the status', () async {
      final (api, _) = buildFailing(400);
      await expectLater(
        api.savePredictionGlobal('m1', const PredictionInput(home: 1, away: 0)),
        throwsStatus(400),
      );
    });
  });
}
