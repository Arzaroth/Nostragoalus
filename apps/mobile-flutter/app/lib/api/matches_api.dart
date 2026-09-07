import 'api_client.dart';
import 'models.gen.dart';

/// The fixture list and everything hanging off one match: the detail tabs, the
/// crowd/bot views of it, live reactions, and the calendar feed.
extension MatchesApi on ApiClient {
  Future<MatchesResponse> matches({String? competition}) async =>
      MatchesResponse.fromJson(await getJson('/api/matches', query: competitionQuery(competition)));

  Future<MatchDetailResponse> match(String id) async =>
      MatchDetailResponse.fromJson(await getJson('/api/matches/$id'));

  Future<MatchTimelineResponse> matchTimeline(String id) async =>
      MatchTimelineResponse.fromJson(await getJson('/api/matches/$id/timeline'));

  Future<MatchLineupsResponse> matchLineups(String id) async =>
      MatchLineupsResponse.fromJson(await getJson('/api/matches/$id/lineups'));

  Future<MatchScorersResponse> matchScorers(String id) async =>
      MatchScorersResponse.fromJson(await getJson('/api/matches/$id/scorers'));

  Future<MatchInsightsResponse> matchInsights(String id) async =>
      MatchInsightsResponse.fromJson(await getJson('/api/matches/$id/insights'));

  /// Upstream live match detail (venue, cards, per-team stats; null when the
  /// provider has nothing for this match).
  Future<Detail?> matchLiveDetail(String id) async =>
      MatchLiveDetailResponse.fromJson(await getJson('/api/matches/$id/live-detail')).detail;

  Future<MatchLeagueStandingsResponse> matchLeagueStandings(String id) async =>
      MatchLeagueStandingsResponse.fromJson(await getJson('/api/matches/$id/league-standings'));

  Future<MatchMediaResponse> matchMedia(String id) async =>
      MatchMediaResponse.fromJson(await getJson('/api/matches/$id/media'));

  Future<PastPicksResponse> pastPicks(String matchId) async =>
      PastPicksResponse.fromJson(await getJson('/api/matches/$matchId/my-past-picks'));

  /// Crowd totals keyed by matchId. Display-only; with [league], summed over
  /// that league's members only (the scoring bonus always uses everyone).
  Future<Map<String, CrowdResponseTotal>> crowdTotals(
          {String? competition, String? league}) async =>
      CrowdResponse.fromJson(await getJson('/api/predictions/crowd',
              query: leagueScopedQuery(competition, league)))
          .totals;

  Future<BotPredictionsResponse> botPredictions({String? competition}) async =>
      BotPredictionsResponse.fromJson(
          await getJson('/api/bot/predictions', query: competitionQuery(competition)));

  Future<ReactionsResponse> reactions(String matchId) async =>
      ReactionsResponse.fromJson(await getJson('/api/reactions/$matchId'));

  Future<void> react(String matchId, String emoji) async =>
      putJson('/api/reactions', body: {'matchId': matchId, 'emoji': emoji});

  /// Calendar-feed subscription URLs for the signed-in user.
  Future<FeedSubscriptionResponse> feedSubscription() async =>
      FeedSubscriptionResponse.fromJson(await getJson('/api/feed/subscription'));

  /// Revoke every prior calendar URL and mint a fresh one.
  Future<Map<String, dynamic>> regenerateFeed() async => postJson('/api/feed/regenerate');
}
