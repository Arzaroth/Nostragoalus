import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/api.dart';

import 'build_client.dart';
import 'helpers.dart';

void main() {
  group('the fixture list', () {
    test('matches sends the competition when one is selected', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'competition': null, 'matches': []}),
      ]);

      final res = await api.matches(competition: 'wc26');
      expect(res.matches, isEmpty);
      expectRequest(adapter,
          method: 'GET', path: '/api/matches', query: {'competition': 'wc26'});
    });

    test('matches omits the competition when none is selected', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'competition': null, 'matches': []}),
      ]);

      await api.matches();
      expectRequest(adapter, method: 'GET', path: '/api/matches');
    });

    test('matches throws rather than rendering an empty fixture list', () async {
      final (api, _) = buildFailing(500);
      await expectLater(api.matches(), throwsStatus(500));
    });
  });

  group('one match: every tab hits its own route', () {
    test('match', () async {
      final (api, adapter) = buildFailing(404);
      await expectLater(api.match('m1'), throwsStatus(404));
      expectRequest(adapter, method: 'GET', path: '/api/matches/m1');
    });

    test('matchTimeline', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'events': []}),
      ]);
      expect((await api.matchTimeline('m1')).events, isEmpty);
      expectRequest(adapter, method: 'GET', path: '/api/matches/m1/timeline');
    });

    test('matchLineups tolerates a match with no lineup yet', () async {
      final (api, adapter) = buildApi([Reply(200, const {'lineups': null})]);
      expect((await api.matchLineups('m1')).lineups, isNull);
      expectRequest(adapter, method: 'GET', path: '/api/matches/m1/lineups');
    });

    test('matchScorers', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'scorers': [], 'assists': []}),
      ]);
      expect((await api.matchScorers('m1')).scorers, isEmpty);
      expectRequest(adapter, method: 'GET', path: '/api/matches/m1/scorers');
    });

    test('matchInsights', () async {
      final (api, adapter) = buildFailing(404);
      await expectLater(api.matchInsights('m1'), throwsStatus(404));
      expectRequest(adapter, method: 'GET', path: '/api/matches/m1/insights');
    });

    test('matchLiveDetail unwraps the envelope', () async {
      final (api, adapter) = buildApi([Reply(200, const {'detail': null})]);
      expect(await api.matchLiveDetail('m1'), isNull);
      expectRequest(adapter, method: 'GET', path: '/api/matches/m1/live-detail');
    });

    test('matchLeagueStandings', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {
          'scope': 'live',
          'rows': [],
          'notPredicted': 2,
          'league': null,
        }),
      ]);

      final res = await api.matchLeagueStandings('m1');
      expect(res.notPredicted, 2);
      expect(res.rows, isEmpty);
      expectRequest(adapter, method: 'GET', path: '/api/matches/m1/league-standings');
    });

    test('matchMedia', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'media': []}),
      ]);
      expect((await api.matchMedia('m1')).media, isEmpty);
      expectRequest(adapter, method: 'GET', path: '/api/matches/m1/media');
    });

    test('pastPicks reads the my-past-picks route', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'scope': 'none', 'earlier': null, 'kept': null, 'cheeky': null}),
      ]);

      final res = await api.pastPicks('m1');
      expect(res.earlier, isNull);
      expectRequest(adapter, method: 'GET', path: '/api/matches/m1/my-past-picks');
    });

    test('matchTimeline throws on a non-2xx', () async {
      final (api, _) = buildFailing(500);
      await expectLater(api.matchTimeline('m1'), throwsStatus(500));
    });

    test('matchLineups throws on a non-2xx', () async {
      final (api, _) = buildFailing(500);
      await expectLater(api.matchLineups('m1'), throwsStatus(500));
    });

    test('matchScorers throws on a non-2xx', () async {
      final (api, _) = buildFailing(500);
      await expectLater(api.matchScorers('m1'), throwsStatus(500));
    });

    test('matchLiveDetail throws on a non-2xx', () async {
      final (api, _) = buildFailing(502);
      await expectLater(api.matchLiveDetail('m1'), throwsStatus(502));
    });

    test('matchLeagueStandings throws on a non-2xx', () async {
      final (api, _) = buildFailing(403);
      await expectLater(api.matchLeagueStandings('m1'), throwsStatus(403));
    });

    test('matchMedia throws on a non-2xx', () async {
      final (api, _) = buildFailing(500);
      await expectLater(api.matchMedia('m1'), throwsStatus(500));
    });

    test('pastPicks throws on a non-2xx', () async {
      final (api, _) = buildFailing(500);
      await expectLater(api.pastPicks('m1'), throwsStatus(500));
    });
  });

  group('crowd, bot, reactions and the calendar feed', () {
    test('crowdTotals scopes to the competition', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'totals': {}, 'league': null}),
      ]);

      expect(await api.crowdTotals(competition: 'wc26'), isEmpty);
      expectRequest(adapter,
          method: 'GET', path: '/api/predictions/crowd', query: {'competition': 'wc26'});
    });

    test('crowdTotals under the league lens sends the league alone', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {
          'totals': {
            'm1': {'home': 4, 'away': 2, 'count': 3},
          },
          'league': {'id': 'lg', 'name': 'Office'},
        }),
      ]);

      final totals = await api.crowdTotals(competition: 'wc26', league: 'lg');
      expect(totals['m1']?.count, 3);
      expectRequest(adapter,
          method: 'GET', path: '/api/predictions/crowd', query: {'league': 'lg'});
    });

    test('crowdTotals throws on a non-2xx', () async {
      final (api, _) = buildFailing(500);
      await expectLater(api.crowdTotals(), throwsStatus(500));
    });

    test('botPredictions scopes to the competition', () async {
      final (api, adapter) = buildFailing(404);
      await expectLater(api.botPredictions(competition: 'euro'), throwsStatus(404));
      expectRequest(adapter,
          method: 'GET', path: '/api/bot/predictions', query: {'competition': 'euro'});
    });

    test('botPredictions parses the bot overview', () async {
      final (api, _) = buildApi([
        Reply(200, const {
          'bot': {'id': 'bot'},
          'persona': 'evil-twin',
          'competition': {'id': 'c1', 'slug': 'wc26', 'name': 'World Cup'},
          'league': null,
          'champion': null,
          'summary': {
            'rank': 4,
            'totalPoints': 30,
            'predictionPoints': 25,
            'championPoints': 5,
            'exactCount': 2,
            'outcomeCount': 6,
            'gdCount': 1,
          },
          'subject': null,
          'admin': false,
          'method': 'MODE',
          'modeAvailable': true,
          'population': 42,
          'predictions': [],
        }),
      ]);

      final res = await api.botPredictions();
      expect(res.persona.wire, 'evil-twin');
      expect(res.summary.totalPoints, 30);
      expect(res.population, 42);
      expect(res.predictions, isEmpty);
    });

    test('reactions reads the per-match totals', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {
          'totals': {'FIRE': 2, 'GOAL': 0, 'WOW': 1, 'LAUGH': 0, 'SAD': 0, 'ANGRY': 0},
          'mine': 'FIRE',
        }),
      ]);

      final res = await api.reactions('m1');
      expect(res.totals.fire, 2);
      expect(res.mine?.wire, 'FIRE');
      expectRequest(adapter, method: 'GET', path: '/api/reactions/m1');
    });

    test('reactions throws on a non-2xx', () async {
      final (api, _) = buildFailing(500);
      await expectLater(api.reactions('m1'), throwsStatus(500));
    });

    test('react puts the match id and emoji', () async {
      final (api, adapter) = buildApi([Reply(200, const {'ok': true})]);

      await api.react('m1', 'FIRE');

      expectRequest(adapter,
          method: 'PUT', path: '/api/reactions', body: {'matchId': 'm1', 'emoji': 'FIRE'});
    });

    test('react surfaces a failure', () async {
      final (api, _) = buildFailing(422);
      await expectLater(api.react('m1', 'NOPE'), throwsStatus(422));
    });

    test('feedSubscription returns both calendar URLs', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'url': 'https://x/f.ics', 'webcalUrl': 'webcal://x/f.ics'}),
      ]);

      final res = await api.feedSubscription();
      expect(res.url, 'https://x/f.ics');
      expect(res.webcalUrl, 'webcal://x/f.ics');
      expectRequest(adapter, method: 'GET', path: '/api/feed/subscription');
    });

    test('feedSubscription throws on a non-2xx', () async {
      final (api, _) = buildFailing(401);
      await expectLater(api.feedSubscription(), throwsStatus(401));
    });

    test('regenerateFeed posts and returns the fresh body', () async {
      final (api, adapter) = buildApi([
        Reply(200, const {'url': 'https://x/new.ics'}),
      ]);

      expect(await api.regenerateFeed(), {'url': 'https://x/new.ics'});
      expectRequest(adapter, method: 'POST', path: '/api/feed/regenerate');
    });

    test('regenerateFeed surfaces a failure', () async {
      final (api, _) = buildFailing(401);
      await expectLater(api.regenerateFeed(), throwsStatus(401));
    });
  });
}
