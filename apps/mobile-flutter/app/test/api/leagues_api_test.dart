import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/api.dart';
import 'package:nostragoalus/api/models.gen.dart';

import 'build_client.dart';
import 'helpers.dart';

void main() {
  group('league lists and detail', () {
    test('leagues carries the selected competition', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'leagues': []}),
      ]);

      expect((await api.leagues(competition: 'wc26')).leagues, isEmpty);
      expectRequest(adapter,
          method: 'GET', path: '/api/leagues', query: {'competition': 'wc26'});
    });

    test('leagues omits the competition when none is selected', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'leagues': []}),
      ]);

      await api.leagues();
      expectRequest(adapter, method: 'GET', path: '/api/leagues');
    });

    test('publicLeagues carries the selected competition', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'competition': null, 'leagues': []}),
      ]);

      expect((await api.publicLeagues(competition: 'wc26')).leagues, isEmpty);
      expectRequest(adapter,
          method: 'GET', path: '/api/leagues/public', query: {'competition': 'wc26'});
    });

    test('leagueDetail reads the league route', () async {
      final (api, adapter) = buildFailing(403);
      await expectLater(api.leagueDetail('lg'), throwsStatus(403));
      expectRequest(adapter, method: 'GET', path: '/api/leagues/lg');
    });

    test('leagues throws rather than showing no leagues', () async {
      final (api, _) = buildFailing(500);
      await expectLater(api.leagues(), throwsStatus(500));
    });

    test('publicLeagues throws on a non-2xx', () async {
      final (api, _) = buildFailing(500);
      await expectLater(api.publicLeagues(), throwsStatus(500));
    });
  });

  group('membership and admin', () {
    test('createLeague sends only the fields that were set', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {
          'league': {'id': 'l1'},
        }),
      ]);

      await api.createLeague(const CreateLeagueInput(competition: 'wc', name: 'Mine'));

      expectRequest(adapter,
          method: 'POST', path: '/api/leagues', body: {'competition': 'wc', 'name': 'Mine'});
    });

    test('updateLeague puts only the keys it is given', () async {
      final (api, adapter) = buildApi([Reply(200, const {'ok': true})]);

      await api.updateLeague('lg', const {'name': 'Renamed'});

      expectRequest(adapter,
          method: 'PUT', path: '/api/leagues/lg', body: {'name': 'Renamed'});
    });

    test('joinLeagueByCode posts the code to the join route', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {
          'league': {'id': 'l1'},
        }),
      ]);

      await api.joinLeagueByCode('ABCD');

      expectRequest(adapter,
          method: 'POST', path: '/api/leagues/join', body: {'code': 'ABCD'});
    });

    test('joinLeague posts to the league join route', () async {
      final (api, adapter) = buildApi([Reply(200, const {'ok': true})]);

      await api.joinLeague('lg');

      expectRequest(adapter, method: 'POST', path: '/api/leagues/lg/join');
    });

    test('leaveLeague posts to the leave route', () async {
      final (api, adapter) = buildApi([Reply(200, const {'ok': true})]);

      await api.leaveLeague('lg');

      expectRequest(adapter, method: 'POST', path: '/api/leagues/lg/leave');
    });

    test('regenerateLeagueCode posts to the regenerate route', () async {
      final (api, adapter) = buildApi([Reply(200, const {'joinCode': 'WXYZ'})]);

      await api.regenerateLeagueCode('lg');

      expectRequest(adapter, method: 'POST', path: '/api/leagues/lg/regenerate-code');
    });

    test('setMemberRole puts the role on the member', () async {
      final (api, adapter) = buildApi([Reply(200, const {'ok': true})]);

      await api.setMemberRole('lg', 'u2', 'MODERATOR');

      expectRequest(adapter,
          method: 'PUT',
          path: '/api/leagues/lg/members/u2',
          body: {'role': 'MODERATOR'});
    });

    test('removeMember deletes the member', () async {
      final (api, adapter) = buildApi([Reply(200, const {'ok': true})]);

      await api.removeMember('lg', 'u2');

      expectRequest(adapter, method: 'DELETE', path: '/api/leagues/lg/members/u2');
    });

    test('transferOwnership posts the new owner', () async {
      final (api, adapter) = buildApi([Reply(200, const {'ok': true})]);

      await api.transferOwnership('lg', 'u2');

      expectRequest(adapter,
          method: 'POST',
          path: '/api/leagues/lg/transfer-ownership',
          body: {'userId': 'u2'});
    });

    test('a bad join code surfaces as an ApiException', () async {
      final (api, _) = buildFailing(404);
      await expectLater(api.joinLeagueByCode('NOPE'), throwsStatus(404));
    });

    test('createLeague surfaces a rejected body', () async {
      final (api, _) = buildFailing(422);
      await expectLater(
        api.createLeague(const CreateLeagueInput(competition: 'wc', name: 'x')),
        throwsStatus(422),
      );
    });

    test('updateLeague surfaces a forbidden change', () async {
      final (api, _) = buildFailing(403);
      await expectLater(api.updateLeague('lg', const {'visibility': 'PUBLIC'}), throwsStatus(403));
    });

    test('joinLeague surfaces a failure', () async {
      final (api, _) = buildFailing(403);
      await expectLater(api.joinLeague('lg'), throwsStatus(403));
    });

    test('leaveLeague surfaces a failure', () async {
      final (api, _) = buildFailing(409);
      await expectLater(api.leaveLeague('lg'), throwsStatus(409));
    });

    test('regenerateLeagueCode surfaces a failure', () async {
      final (api, _) = buildFailing(403);
      await expectLater(api.regenerateLeagueCode('lg'), throwsStatus(403));
    });

    test('setMemberRole surfaces a failure', () async {
      final (api, _) = buildFailing(403);
      await expectLater(api.setMemberRole('lg', 'u2', 'MODERATOR'), throwsStatus(403));
    });

    test('removeMember surfaces a failure', () async {
      final (api, _) = buildFailing(403);
      await expectLater(api.removeMember('lg', 'u2'), throwsStatus(403));
    });

    test('transferOwnership surfaces a failure', () async {
      final (api, _) = buildFailing(403);
      await expectLater(api.transferOwnership('lg', 'u2'), throwsStatus(403));
    });
  });

  group('invites', () {
    test('leagueInvites reads the invite list', () async {
      final (api, adapter) = buildApi([
        Reply(200, {
          'invites': [
            {
              'id': 'i1',
              'token': 'tok',
              'expiresAt': null,
              'maxUses': null,
              'uses': 0,
              'createdAt': DateTime.utc(2026).toIso8601String(),
              'status': 'ACTIVE',
            },
          ],
        }),
      ]);

      final res = await api.leagueInvites('lg');
      expect(res.invites.single.token, 'tok');
      expectRequest(adapter, method: 'GET', path: '/api/leagues/lg/invites');
    });

    test('createInvite omits the limits that were not set', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'invite': {}}),
      ]);

      await api.createInvite('lg');

      expectRequest(adapter,
          method: 'POST',
          path: '/api/leagues/lg/invites',
          body: const <String, dynamic>{});
    });

    test('createInvite sends both limits when set', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'invite': {}}),
      ]);

      await api.createInvite('lg', expiresInHours: 24, maxUses: 5);

      expectRequest(adapter, method: 'POST', path: '/api/leagues/lg/invites', body: {
        'expiresInHours': 24,
        'maxUses': 5,
      });
    });

    test('deleteInvite deletes the invite', () async {
      final (api, adapter) = buildApi([Reply(200, const {'ok': true})]);

      await api.deleteInvite('lg', 'i1');

      expectRequest(adapter, method: 'DELETE', path: '/api/leagues/lg/invites/i1');
    });

    test('invitePreview reads the public landing route', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'name': 'Mine', 'memberCount': 3}),
      ]);

      final res = await api.invitePreview('tok');
      expect(res['memberCount'], 3);
      expectRequest(adapter, method: 'GET', path: '/api/leagues/invite/tok');
    });

    test('acceptInvite posts to the accept route', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {
          'league': {'id': 'l1'},
        }),
      ]);

      final res = await api.acceptInvite('tok');
      expect(res['league'], {'id': 'l1'});
      expectRequest(adapter, method: 'POST', path: '/api/leagues/invite/tok/accept');
    });

    test('an expired invite surfaces as an ApiException', () async {
      final (api, _) = buildFailing(410);
      await expectLater(api.acceptInvite('tok'), throwsStatus(410));
    });

    test('invitePreview surfaces a failure', () async {
      final (api, _) = buildFailing(404);
      await expectLater(api.invitePreview('tok'), throwsStatus(404));
    });

    test('leagueInvites surfaces a failure', () async {
      final (api, _) = buildFailing(403);
      await expectLater(api.leagueInvites('lg'), throwsStatus(403));
    });

    test('createInvite surfaces the too-many-invites conflict', () async {
      final (api, _) = buildFailing(409);
      await expectLater(api.createInvite('lg'), throwsStatus(409));
    });

    test('deleteInvite surfaces a failure', () async {
      final (api, _) = buildFailing(403);
      await expectLater(api.deleteInvite('lg', 'i1'), throwsStatus(403));
    });
  });

  group('prizes and boards', () {
    test('updateLeagueRewards wraps the criteria in items', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'ok': true, 'rewards': []}),
      ]);

      await api.updateLeagueRewards('lg', const [
        {'type': 'OVERALL', 'label': 'Cup'},
      ]);

      expectRequest(adapter, method: 'PUT', path: '/api/leagues/lg/rewards', body: {
        'items': [
          {'type': 'OVERALL', 'label': 'Cup'},
        ],
      });
    });

    test('leagueRewards parses the root array', () async {
      final (api, adapter) = buildApi([
        Reply(200, const [
          {
            'type': 'OVERALL',
            'reward': null,
            'winners': [],
            'value': 12,
            'metric': 'POINTS',
            'teamCode': null,
            'disabled': false,
            'youHold': false,
          },
        ]),
      ]);

      final rewards = await api.leagueRewards('lg');
      expect(rewards.single.value, 12);
      expectRequest(adapter, method: 'GET', path: '/api/leagues/lg/rewards');
    });

    test('rewardRanking reads the per-criterion ranking', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'rows': []}),
      ]);

      final res = await api.rewardRanking('lg', 'OVERALL');
      expect(res['rows'], isEmpty);
      expectRequest(adapter, method: 'GET', path: '/api/leagues/lg/rewards/OVERALL/ranking');
    });

    test('leagueBoard reads the mode board', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {
          'board': {'kind': 'POINTS', 'mode': 'HARDCORE', 'live': false, 'rows': []},
          'mode': 'HARDCORE',
          'lives': 3,
        }),
      ]);

      final res = await api.leagueBoard('lg');
      expect(res.lives, 3);
      expect(res.mode.wire, 'HARDCORE');
      expectRequest(adapter, method: 'GET', path: '/api/leagues/lg/mode-board');
    });

    test('leaderboard scopes to the competition', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {
          'competition': null,
          'league': null,
          'live': null,
          'hiddenCount': null,
          'rows': [],
        }),
      ]);

      expect((await api.leaderboard(competition: 'wc26')).rows, isEmpty);
      expectRequest(adapter,
          method: 'GET', path: '/api/leaderboard', query: {'competition': 'wc26'});
    });

    // A league fixes its own competition; sending a slug alongside it 400s when
    // the two disagree, so the lens replaces the slug rather than joining it.
    test('leaderboard under the league lens sends the league alone', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {
          'competition': null,
          'league': {'id': 'lg', 'name': 'Office'},
          'live': null,
          'hiddenCount': 2,
          'rows': [],
        }),
      ]);

      final res = await api.leaderboard(competition: 'wc26', league: 'lg');
      expect(res.league?.name, 'Office');
      expect(res.hiddenCount, 2);
      expectRequest(adapter, method: 'GET', path: '/api/leaderboard', query: {'league': 'lg'});
    });

    test('leagueCompleteness scopes to the competition', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'leagues': []}),
      ]);

      expect(await api.leagueCompleteness(competition: 'wc26'), isEmpty);
      expectRequest(adapter,
          method: 'GET',
          path: '/api/leagues/completeness',
          query: {'competition': 'wc26'});
    });

    test('updateLeagueRewards surfaces a rejected prize set', () async {
      final (api, _) = buildFailing(422);
      await expectLater(api.updateLeagueRewards('lg', const []), throwsStatus(422));
    });

    test('rewardRanking surfaces a failure', () async {
      final (api, _) = buildFailing(404);
      await expectLater(api.rewardRanking('lg', 'OVERALL'), throwsStatus(404));
    });

    test('leagueBoard surfaces a failure', () async {
      final (api, _) = buildFailing(403);
      await expectLater(api.leagueBoard('lg'), throwsStatus(403));
    });

    test('leaderboard throws rather than showing an empty board', () async {
      final (api, _) = buildFailing(500);
      await expectLater(api.leaderboard(), throwsStatus(500));
    });
  });

  group('predictions', () {
    test('myPredictions carries the selected competition', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'predictions': []}),
      ]);

      expect((await api.myPredictions(competition: 'wc26')).predictions, isEmpty);
      expectRequest(adapter,
          method: 'GET', path: '/api/predictions', query: {'competition': 'wc26'});
    });

    test('savePrediction omits an unset optional but keeps a null wager', () async {
      final (api, adapter) = buildApi([Reply(200, const {'id': 'p1'})]);

      final res =
          await api.savePrediction('lg', 'mt', const PredictionInput(home: 2, away: 1));

      expect(res.id, 'p1');
      expectRequest(adapter,
          method: 'PUT',
          path: '/api/leagues/lg/predictions/mt',
          body: {'home': 2, 'away': 1, 'wager': null});
    });

    test('savePrediction carries the stake and outcome-only flag', () async {
      final (api, adapter) = buildApi([Reply(200, const {'id': 'p1'})]);

      await api.savePrediction('lg', 'mt',
          const PredictionInput(home: 0, away: 0, isOutcomeOnly: true, wager: 5));

      expectRequest(adapter,
          method: 'PUT',
          path: '/api/leagues/lg/predictions/mt',
          body: {'home': 0, 'away': 0, 'isOutcomeOnly': true, 'wager': 5});
    });

    test('setJoker puts the match and the flag', () async {
      final (api, adapter) = buildApi([Reply(200, const {'ok': true})]);

      await api.setJoker('lg', 'mt', false);

      expectRequest(adapter,
          method: 'PUT',
          path: '/api/leagues/lg/joker',
          body: {'matchId': 'mt', 'isJoker': false});
    });

    test('a locked match rejects the save with an ApiException', () async {
      final (api, _) = buildFailing(409);
      await expectLater(
        api.savePrediction('lg', 'mt', const PredictionInput(home: 1, away: 0)),
        throwsStatus(409),
      );
    });

    test('setJoker surfaces the already-kicked-off conflict', () async {
      final (api, _) = buildFailing(409);
      await expectLater(api.setJoker('lg', 'mt', true), throwsStatus(409));
    });

    test('myPredictions throws on a non-2xx', () async {
      final (api, _) = buildFailing(500);
      await expectLater(api.myPredictions(), throwsStatus(500));
    });
  });
}
