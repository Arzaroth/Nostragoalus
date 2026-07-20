import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/api.dart';
import 'package:nostragoalus/api/models.gen.dart';
import 'package:nostragoalus/api/token_store.dart';

import 'helpers.dart';

(ApiClient, FakeAdapter) build(List<Reply> replies) {
  final adapter = FakeAdapter(replies);
  final api = ApiClient(TokenStore(InMemoryKv()), dio: Dio()..httpClientAdapter = adapter);
  return (api, adapter);
}

void main() {
  group('mutations pin their method, path and body', () {
    test('savePrediction omits an unset optional but keeps a null wager', () async {
      final (api, adapter) = build([Reply(200, {'id': 'p1'})]);

      final res = await api.savePrediction('lg', 'mt', const PredictionInput(home: 2, away: 1));

      final req = adapter.requests.single;
      expect(req.method, 'PUT');
      expect(req.path, '/api/leagues/lg/predictions/mt');
      expect(req.data, {'home': 2, 'away': 1, 'wager': null});
      expect(res.id, 'p1');
    });

    test('createLeague sends only the fields that were set', () async {
      final (api, adapter) = build([Reply(200, {'league': {'id': 'l1'}})]);

      await api.createLeague(const CreateLeagueInput(competition: 'wc', name: 'Mine'));

      final req = adapter.requests.single;
      expect(req.method, 'POST');
      expect(req.path, '/api/leagues');
      expect(req.data, {'competition': 'wc', 'name': 'Mine'});
    });

    test('sendChat drops empty mention and image lists', () async {
      final (api, adapter) = build([Reply(200, {'ok': true})]);

      await api.sendChat('lg', 'cipher', 3, matchId: 'mt', mentions: const [], images: const []);

      final req = adapter.requests.single;
      expect(req.method, 'POST');
      expect(req.path, '/api/leagues/lg/chat/messages');
      expect(req.data, {'ciphertext': 'cipher', 'epoch': 3, 'matchId': 'mt'});
    });

    test('setShowcase wraps the keys in ordered items', () async {
      final (api, adapter) = build([Reply(200, {'ok': true})]);

      await api.setShowcase(const ['a', 'b'], competition: 'wc');

      final req = adapter.requests.single;
      expect(req.method, 'PUT');
      expect(req.path, '/api/showcase');
      expect(req.data, {
        'competition': 'wc',
        'items': [
          {'achievementKey': 'a'},
          {'achievementKey': 'b'},
        ],
      });
    });

    test('setBestScorer omits a null team code', () async {
      final (api, adapter) = build([Reply(200, {'ok': true})]);

      await api.setBestScorer(playerId: 'p9', playerName: 'Nine', teamName: 'Team');

      final req = adapter.requests.single;
      expect(req.method, 'PUT');
      expect(req.path, '/api/best-scorer');
      expect(req.data, {'playerId': 'p9', 'playerName': 'Nine', 'teamName': 'Team'});
    });
  });

  group('readers surface a failure instead of mis-reading the error body', () {
    Matcher throwsStatus(int status) =>
        throwsA(isA<ApiException>().having((e) => e.status, 'status', status));

    test('meRewards throws on a non-2xx error object', () async {
      final (api, _) = build([Reply(500, {'error': 'boom'})]);
      await expectLater(api.meRewards(), throwsStatus(500));
    });

    test('meRewards parses the root array', () async {
      final (api, _) = build([
        Reply(200, [
          {
            'leagueId': 'l1',
            'leagueName': 'Mine',
            'reward': {
              'type': 'OVERALL',
              'label': 'Cup',
              'imageUrl': null,
              'note': null,
              'link': null,
            },
            'type': 'OVERALL',
            'teamCode': null,
            'youHold': true,
          },
        ]),
      ]);

      final rewards = await api.meRewards();
      expect(rewards.single.leagueName, 'Mine');
      expect(rewards.single.youHold, isTrue);
    });

    test('leagueRewards throws on a non-2xx error object', () async {
      final (api, _) = build([Reply(403, {'error': 'forbidden'})]);
      await expectLater(api.leagueRewards('lg'), throwsStatus(403));
    });

    test('listSessions throws rather than reporting an empty device list', () async {
      final (api, _) = build([Reply(500, {'error': 'down'})]);
      await expectLater(api.listSessions(), throwsStatus(500));
    });

    test('listSessions unwraps a {sessions: [...]} body', () async {
      final (api, _) = build([
        Reply(200, {
          'sessions': [
            {'token': 't1'},
          ],
        }),
      ]);

      expect(await api.listSessions(), hasLength(1));
    });

    test('chatReports throws on a non-2xx', () async {
      final (api, _) = build([Reply(403, {'error': 'not a mod'})]);
      await expectLater(api.chatReports('lg'), throwsStatus(403));
    });

    test('iceServers throws on a non-2xx', () async {
      final (api, _) = build([Reply(401, {'error': 'unauthorized'})]);
      await expectLater(api.iceServers(), throwsStatus(401));
    });

    test('dmPublicKey throws on a non-2xx', () async {
      final (api, _) = build([Reply(404, {'error': 'no identity'})]);
      await expectLater(api.dmPublicKey('u1'), throwsStatus(404));
    });

    test('createDmThread throws on a non-2xx', () async {
      final (api, _) = build([Reply(422, {'error': 'bad wraps'})]);
      await expectLater(api.createDmThread('u1', const []), throwsStatus(422));
    });

    test('leagueCompleteness throws on a non-2xx', () async {
      final (api, _) = build([Reply(500, {'error': 'boom'})]);
      await expectLater(api.leagueCompleteness(), throwsStatus(500));
    });

    test('teamSquad throws on a non-2xx', () async {
      final (api, _) = build([Reply(404, {'error': 'no team'})]);
      await expectLater(api.teamSquad('FRA'), throwsStatus(404));
    });

    test('crowdTotals parses the typed totals map', () async {
      final (api, _) = build([
        Reply(200, {
          'totals': {
            'm1': {'home': 3, 'away': 1, 'count': 4},
          },
        }),
      ]);

      final totals = await api.crowdTotals();
      expect(totals['m1']!.home, 3);
      expect(totals['m1']!.count, 4);
    });

    test('eliminatedTeams reads the codes', () async {
      final (api, _) = build([
        Reply(200, {
          'codes': ['FRA', 'BRA'],
        }),
      ]);

      expect(await api.eliminatedTeams(), ['FRA', 'BRA']);
    });

    // The old ['token'].toString() built https://.../a/null out of a missing key.
    test('mintAnalyticsShare refuses a body without a token', () async {
      final (api, _) = build([Reply(200, {'url': 'u', 'imageUrl': 'i'})]);
      await expectLater(api.mintAnalyticsShare(), throwsA(isA<TypeError>()));
    });

    test('mintAnalyticsShare returns the token', () async {
      final (api, _) = build([Reply(200, {'token': 'tk', 'url': 'u', 'imageUrl': 'i'})]);
      expect(await api.mintAnalyticsShare(competition: 'wc'), 'tk');
    });

    // The voice mesh re-arms its TURN refresh from this ttl; dropping it pinned
    // the interval to a guessed constant.
    test('iceServers keeps the credential ttl alongside the servers', () async {
      final (api, _) = build([
        Reply(200, {
          'iceServers': [
            {'urls': 'stun:stun.example:3478'},
            {'urls': ['turn:turn.example:3478'], 'username': 'u', 'credential': 'c'},
          ],
          'ttl': 600,
        }),
      ]);

      final res = await api.iceServers();
      expect(res.ttl, 600);
      expect(res.iceServers, hasLength(2));
      expect(res.iceServers.first.urls, 'stun:stun.example:3478');
    });

    test('matchLiveDetail unwraps the envelope and tolerates a null detail', () async {
      final (empty, _) = build([Reply(200, const {'detail': null})]);
      expect(await empty.matchLiveDetail('m1'), isNull);
    });

    test('chatAttachment returns the typed ciphertext envelope', () async {
      final (api, adapter) = build([Reply(200, const {'ciphertext': 'AAA', 'epoch': 2})]);
      final att = await api.chatAttachment('l1', 'm1', 3);
      expect(att.ciphertext, 'AAA');
      expect(att.epoch.toInt(), 2);
      expect(adapter.requests.single.path, '/api/leagues/l1/chat/attachments/m1');
    });
  });
}
