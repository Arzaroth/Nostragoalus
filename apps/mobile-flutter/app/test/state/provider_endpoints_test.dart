import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostragoalus/api/api.dart';
import 'package:nostragoalus/api/token_store.dart';
import 'package:nostragoalus/state/providers.dart';

import '../api/helpers.dart';

/// Records every request and answers `{}`, so a provider's endpoint can be
/// pinned without a full response fixture for each one.
class _Recorder implements HttpClientAdapter {
  final List<RequestOptions> requests = [];

  @override
  Future<ResponseBody> fetch(
      RequestOptions options, Stream<dynamic>? requestStream, Future<void>? cancelFuture) async {
    requests.add(options);
    return ResponseBody.fromString('{}', 200, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  // Each provider's endpoint, and whether it must carry the selected
  // competition. The scoping half is the point: eight of these silently dropped
  // it and answered for the server default while the app showed a switcher.
  const competition = 'wc26';

  ({ProviderContainer c, _Recorder rec}) build() {
    final rec = _Recorder();
    final api = ApiClient(TokenStore(InMemoryKv()), dio: Dio()..httpClientAdapter = rec);
    final c = ProviderContainer(overrides: [
      apiProvider.overrideWithValue(api),
      selectedCompetitionProvider.overrideWith((ref) => competition),
    ]);
    addTearDown(c.dispose);
    return (c: c, rec: rec);
  }

  /// Reads [read] and returns the single request it issued. The response is
  /// deliberately `{}`, so a typed parse may throw AFTER the call - which is
  /// fine here: this asserts what went out, not what came back.
  Future<RequestOptions> requestFrom(Future<void> Function(ProviderContainer) read) async {
    final b = build();
    try {
      await read(b.c);
    } catch (_) {/* the empty body fails the typed parse; the call still happened */}
    expect(b.rec.requests, isNotEmpty, reason: 'the provider issued no request');
    return b.rec.requests.first;
  }

  group('competition-scoped reads', () {
    final scoped = <String, (String, Future<void> Function(ProviderContainer))>{
      'standings': ('/api/competitions/standings', (c) => c.read(standingsProvider.future)),
      'scorers': ('/api/competitions/scorers', (c) => c.read(scorersProvider.future)),
      'teams': ('/api/competitions/teams', (c) => c.read(teamsProvider.future)),
      'eliminated': ('/api/competitions/eliminated', (c) => c.read(eliminatedProvider.future)),
      'bracket': ('/api/competitions/bracket', (c) => c.read(bracketProvider.future)),
      'matches': ('/api/matches', (c) => c.read(matchesProvider.future)),
      'crowd totals': ('/api/predictions/crowd', (c) => c.read(crowdTotalsProvider.future)),
      'leaderboard': ('/api/leaderboard', (c) => c.read(leaderboardProvider.future)),
      'leagues': ('/api/leagues', (c) => c.read(leaguesProvider.future)),
      'public leagues': ('/api/leagues/public', (c) => c.read(publicLeaguesProvider.future)),
      'my predictions': ('/api/predictions', (c) => c.read(myPredictionsProvider.future)),
      'analytics': ('/api/me/analytics', (c) => c.read(analyticsProvider.future)),
      'wrapped': ('/api/me/wrapped', (c) => c.read(wrappedProvider.future)),
      'me stats': ('/api/me/stats', (c) => c.read(meStatsProvider.future)),
      'champion': ('/api/champion', (c) => c.read(championProvider.future)),
      'best scorer': ('/api/best-scorer', (c) => c.read(bestScorerProvider.future)),
      'bot predictions': ('/api/bot/predictions', (c) => c.read(botPredictionsProvider.future)),
      'cabinet': ('/api/users/u1/cabinet', (c) => c.read(cabinetProvider('u1').future)),
      'league completeness':
          ('/api/leagues/completeness', (c) => c.read(leagueCompletenessProvider.future)),
    };

    scoped.forEach((name, spec) {
      final (path, read) = spec;
      test('$name reads $path for the SELECTED competition', () async {
        final req = await requestFrom(read);
        expect(req.path, path);
        expect(req.queryParameters['competition'], competition,
            reason: 'this read answered for the server default, not the selection');
      });
    });
  });

  group('unscoped reads', () {
    final plain = <String, (String, Future<void> Function(ProviderContainer))>{
      'competitions': ('/api/competitions', (c) => c.read(competitionsProvider.future)),
      'notifications': ('/api/notifications', (c) => c.read(notificationsProvider.future)),
      'roadmap': ('/api/roadmap', (c) => c.read(roadmapProvider.future)),
      'commitments': ('/api/commitments', (c) => c.read(commitmentsProvider.future)),
      'feed subscription':
          ('/api/feed/subscription', (c) => c.read(feedSubscriptionProvider.future)),
      'sessions': ('/api/auth/list-sessions', (c) => c.read(sessionsProvider.future)),
      'me rewards': ('/api/me/rewards', (c) => c.read(meRewardsProvider.future)),
      'match': ('/api/matches/m1', (c) => c.read(matchProvider('m1').future)),
      'match timeline':
          ('/api/matches/m1/timeline', (c) => c.read(matchTimelineProvider('m1').future)),
      'match lineups':
          ('/api/matches/m1/lineups', (c) => c.read(matchLineupsProvider('m1').future)),
      'match scorers':
          ('/api/matches/m1/scorers', (c) => c.read(matchScorersProvider('m1').future)),
      'match insights':
          ('/api/matches/m1/insights', (c) => c.read(matchInsightsProvider('m1').future)),
      'match live detail':
          ('/api/matches/m1/live-detail', (c) => c.read(matchLiveDetailProvider('m1').future)),
      'match league standings': (
        '/api/matches/m1/league-standings',
        (c) => c.read(matchLeagueStandingsProvider('m1').future)
      ),
      'match media': ('/api/matches/m1/media', (c) => c.read(matchMediaProvider('m1').future)),
      'past picks':
          ('/api/matches/m1/my-past-picks', (c) => c.read(pastPicksProvider('m1').future)),
      'reactions': ('/api/reactions/m1', (c) => c.read(reactionsProvider('m1').future)),
      'league board':
          ('/api/leagues/l1/mode-board', (c) => c.read(leagueBoardProvider('l1').future)),
      'league detail': ('/api/leagues/l1', (c) => c.read(leagueDetailProvider('l1').future)),
      'league invites':
          ('/api/leagues/l1/invites', (c) => c.read(leagueInvitesProvider('l1').future)),
      'league rewards':
          ('/api/leagues/l1/rewards', (c) => c.read(leagueRewardsProvider('l1').future)),
      'squad': ('/api/teams/ESP', (c) => c.read(squadProvider('ESP').future)),
      'invite preview':
          ('/api/leagues/invite/tok', (c) => c.read(invitePreviewProvider('tok').future)),
      'share card': ('/api/share/tok', (c) => c.read(shareCardProvider(('s', 'tok')).future)),
      'head to head': ('/api/head-to-head', (c) => c.read(headToHeadProvider(('a', 'b')).future)),
    };

    plain.forEach((name, spec) {
      final (path, read) = spec;
      test('$name reads $path', () async {
        expect((await requestFrom(read)).path, path);
      });
    });
  });

  group('the unread badge', () {
    test('is zero until the notifications read resolves', () async {
      final b = build();
      expect(b.c.read(unreadCountProvider), 0);
    });
  });

  group('mutations', () {
    test('setChampion PUTs the pick', () async {
      final req = await requestFrom((c) => c.read(setChampionProvider)('ESP', 'Spain'));
      expect(req.path, '/api/champion');
      expect(req.method, 'PUT');
    });

    test('setBestScorer PUTs the pick', () async {
      final req = await requestFrom(
          (c) => c.read(setBestScorerProvider)(
              playerId: 'p1', playerName: 'Nine', teamName: 'Spain', teamCode: 'ESP'));
      expect(req.path, '/api/best-scorer');
      expect(req.method, 'PUT');
    });

    test('joinLeague by id and by code hit their own routes', () async {
      expect((await requestFrom((c) => c.read(joinLeagueProvider)(leagueId: 'l1'))).path,
          '/api/leagues/l1/join');
      expect((await requestFrom((c) => c.read(joinLeagueProvider)(code: 'ABC'))).path,
          '/api/leagues/join');
    });

    test('leaveLeague posts to the league', () async {
      expect((await requestFrom((c) => c.read(leaveLeagueProvider)('l1'))).path,
          '/api/leagues/l1/leave');
    });

    test('markNotificationsRead posts the ids', () async {
      final req =
          await requestFrom((c) => c.read(markNotificationsReadProvider)(ids: const ['n1']));
      expect(req.path, '/api/notifications/read');
      expect(req.method, 'POST');
    });
  });
}
