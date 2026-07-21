import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/api.dart';

import 'build_client.dart';
import 'helpers.dart';

void main() {
  group('tournament reads', () {
    test('competitions lists what the server offers', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {
          'competitions': [
            {'id': 'c1', 'slug': 'wc26', 'name': 'World Cup'},
          ],
        }),
      ]);

      final res = await api.competitions();
      expect(res.competitions.single.slug, 'wc26');
      expectRequest(adapter, method: 'GET', path: '/api/competitions');
    });

    test('standings scopes to the competition', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'groups': []}),
      ]);

      expect((await api.standings(competition: 'wc26')).groups, isEmpty);
      expectRequest(adapter,
          method: 'GET',
          path: '/api/competitions/standings',
          query: {'competition': 'wc26'});
    });

    test('scorers reads both the scorer and assist boards', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'scorers': [], 'assists': []}),
      ]);

      final res = await api.scorers();
      expect(res.assists, isEmpty);
      expectRequest(adapter, method: 'GET', path: '/api/competitions/scorers');
    });

    test('eliminatedTeams scopes to the competition', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {
          'codes': ['FRA'],
        }),
      ]);

      expect(await api.eliminatedTeams(competition: 'euro'), ['FRA']);
      expectRequest(adapter,
          method: 'GET',
          path: '/api/competitions/eliminated',
          query: {'competition': 'euro'});
    });

    test('teams scopes to the competition', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'teams': []}),
      ]);

      expect((await api.teams(competition: 'wc26')).teams, isEmpty);
      expectRequest(adapter,
          method: 'GET', path: '/api/competitions/teams', query: {'competition': 'wc26'});
    });

    test('bracket tolerates a tournament still in the group stage', () async {
      final (api, adapter) = buildApi([Reply(200, const {'bracket': null})]);

      expect((await api.bracket()).bracket, isNull);
      expectRequest(adapter, method: 'GET', path: '/api/competitions/bracket');
    });

    test('teamSquad reads the squad for the team code', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {
          'team': null,
          'matches': [],
          'group': null,
          'standings': null,
          'topScorer': null,
          'topAssister': null,
          'teamStats': null,
          'squad': [
            {
              'playerId': 'p1',
              'name': 'Nine',
              'shirtNumber': 9,
              'position': 'FW',
              'captain': false,
              'pictureUrl': null,
              'x': null,
              'y': null,
              'goals': 3,
              'assists': 1,
            },
          ],
          'coach': null,
          'competitions': [],
        }),
      ]);

      final squad = await api.teamSquad('FRA', competition: 'wc26');
      expect(squad.single.name, 'Nine');
      expect(squad.single.goals, 3);
      expectRequest(adapter,
          method: 'GET', path: '/api/teams/FRA', query: {'competition': 'wc26'});
    });

    test('commitments reads the tamper-evidence chain', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {
          'entries': [],
          'head': {'seq': 4, 'headHash': 'abc'},
          'nextSeq': 5,
        }),
      ]);

      final res = await api.commitments();
      expect(res.head.headHash, 'abc');
      expect(res.nextSeq, 5);
      expectRequest(adapter, method: 'GET', path: '/api/commitments');
    });

    test('competitions throws on a non-2xx', () async {
      final (api, _) = buildFailing(500);
      await expectLater(api.competitions(), throwsStatus(500));
    });

    test('standings throws on a non-2xx', () async {
      final (api, _) = buildFailing(404);
      await expectLater(api.standings(), throwsStatus(404));
    });

    test('scorers throws on a non-2xx', () async {
      final (api, _) = buildFailing(500);
      await expectLater(api.scorers(), throwsStatus(500));
    });

    test('teams throws on a non-2xx', () async {
      final (api, _) = buildFailing(404);
      await expectLater(api.teams(), throwsStatus(404));
    });

    test('bracket throws on a non-2xx', () async {
      final (api, _) = buildFailing(404);
      await expectLater(api.bracket(), throwsStatus(404));
    });

    test('commitments throws on a non-2xx', () async {
      final (api, _) = buildFailing(500);
      await expectLater(api.commitments(), throwsStatus(500));
    });
  });

  group('season-long picks', () {
    test('champion reads the pick screen state', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {
          'competition': null,
          'teams': [
            {'code': 'FRA', 'name': 'France', 'fifaRank': 2, 'potentialPoints': 12},
          ],
          'myPick': null,
          'locked': false,
          'secondChance': {'open': true, 'closesAt': null},
        }),
      ]);

      final res = await api.champion(competition: 'wc26');
      expect(res.teams.single.code, 'FRA');
      expect(res.secondChance.open, isTrue);
      expectRequest(adapter,
          method: 'GET', path: '/api/champion', query: {'competition': 'wc26'});
    });

    test('setChampion puts the team code and name', () async {
      final (api, adapter) = buildApi([Reply(200, const {'ok': true})]);

      await api.setChampion('FRA', 'France');

      expectRequest(adapter,
          method: 'PUT',
          path: '/api/champion',
          body: {'teamCode': 'FRA', 'teamName': 'France'});
    });

    test('bestScorer reads the Golden Boot state', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {
          'competition': null,
          'provider': null,
          'season': null,
          'bonus': 15,
          'teams': [],
          'myPick': null,
          'locked': false,
          'secondChance': {'open': false, 'closesAt': null},
        }),
      ]);

      final res = await api.bestScorer(competition: 'wc26');
      expect(res.bonus, 15);
      expect(res.locked, isFalse);
      expectRequest(adapter,
          method: 'GET', path: '/api/best-scorer', query: {'competition': 'wc26'});
    });

    test('setBestScorer keeps the team code and competition when given', () async {
      final (api, adapter) = buildApi([Reply(200, const {'ok': true})]);

      await api.setBestScorer(
        playerId: 'p9',
        playerName: 'Nine',
        teamCode: 'FRA',
        teamName: 'France',
        competition: 'wc26',
      );

      expectRequest(adapter, method: 'PUT', path: '/api/best-scorer', body: {
        'playerId': 'p9',
        'playerName': 'Nine',
        'teamCode': 'FRA',
        'teamName': 'France',
        'competition': 'wc26',
      });
    });

    test('champion throws on a non-2xx', () async {
      final (api, _) = buildFailing(404);
      await expectLater(api.champion(), throwsStatus(404));
    });

    test('bestScorer throws on a non-2xx', () async {
      final (api, _) = buildFailing(404);
      await expectLater(api.bestScorer(), throwsStatus(404));
    });

    test('a locked champion pick surfaces as an ApiException', () async {
      final (api, _) = buildFailing(409);
      await expectLater(api.setChampion('FRA', 'France'), throwsStatus(409));
    });

    test('a locked Golden Boot pick surfaces as an ApiException', () async {
      final (api, _) = buildFailing(409);
      await expectLater(
        api.setBestScorer(playerId: 'p9', playerName: 'Nine', teamName: 'France'),
        throwsStatus(409),
      );
    });

    test('teamSquad throws on a non-2xx', () async {
      final (api, _) = buildFailing(404);
      await expectLater(api.teamSquad('FRA'), throwsStatus(404));
    });

    test('eliminatedTeams throws on a non-2xx', () async {
      final (api, _) = buildFailing(500);
      await expectLater(api.eliminatedTeams(), throwsStatus(500));
    });
  });
}
