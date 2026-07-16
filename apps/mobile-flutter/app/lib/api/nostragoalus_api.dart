import 'api_client.dart';
import 'models.gen.dart';

/// Typed facade over the MVP endpoints. Each method maps one route to its
/// generated response model. Competition/league scoping is server-side (session
/// + route context) for these routes, so they take no query parameters yet.
class NostragoalusApi {
  NostragoalusApi(this._api);

  final ApiClient _api;

  Future<CompetitionsResponse> competitions() async =>
      CompetitionsResponse.fromJson(await _api.getJson('/api/competitions'));

  Future<StandingsResponse> standings() async =>
      StandingsResponse.fromJson(await _api.getJson('/api/competitions/standings'));

  Future<ScorersResponse> scorers() async =>
      ScorersResponse.fromJson(await _api.getJson('/api/competitions/scorers'));

  Future<MatchesResponse> matches() async =>
      MatchesResponse.fromJson(await _api.getJson('/api/matches'));

  Future<MatchDetailResponse> match(String id) async =>
      MatchDetailResponse.fromJson(await _api.getJson('/api/matches/$id'));

  Future<LeaderboardResponse> leaderboard() async =>
      LeaderboardResponse.fromJson(await _api.getJson('/api/leaderboard'));

  Future<LeaguesResponse> leagues() async =>
      LeaguesResponse.fromJson(await _api.getJson('/api/leagues'));

  Future<PredictionsResponse> myPredictions() async =>
      PredictionsResponse.fromJson(await _api.getJson('/api/predictions'));

  Future<PredictionSaveResponse> savePrediction(
    String leagueId,
    String matchId,
    PredictionInput input,
  ) async =>
      PredictionSaveResponse.fromJson(await _api.putJson(
        '/api/leagues/$leagueId/predictions/$matchId',
        body: input.toJson(),
      ));

  /// Set or clear this match as the league's joker (one per league).
  Future<void> setJoker(String leagueId, String matchId, bool isJoker) async {
    await _api.putJson('/api/leagues/$leagueId/joker',
        body: {'matchId': matchId, 'isJoker': isJoker});
  }

  // --- Phase 2 ---

  Future<PublicLeaguesResponse> publicLeagues() async =>
      PublicLeaguesResponse.fromJson(await _api.getJson('/api/leagues/public'));

  Future<void> joinLeagueByCode(String code) async =>
      _api.postJson('/api/leagues/join', body: {'code': code});

  Future<void> joinLeague(String leagueId) async =>
      _api.postJson('/api/leagues/$leagueId/join');

  Future<ModeBoardResponse> leagueBoard(String leagueId) async =>
      ModeBoardResponse.fromJson(await _api.getJson('/api/leagues/$leagueId/mode-board'));

  Future<NotificationsResponse> notifications() async =>
      NotificationsResponse.fromJson(await _api.getJson('/api/notifications'));

  Future<void> markNotificationsRead({List<String>? ids, bool all = false}) async =>
      _api.postJson('/api/notifications/read', body: all ? {'all': true} : {'ids': ids ?? []});

  Future<AnalyticsResponse> analytics() async =>
      AnalyticsResponse.fromJson(await _api.getJson('/api/me/analytics'));

  /// Wrapped is a top-level oneOf (ready vs not-ready); returned raw.
  Future<Map<String, dynamic>> wrapped() async => _api.getJson('/api/me/wrapped');

  Future<ReactionsResponse> reactions(String matchId) async =>
      ReactionsResponse.fromJson(await _api.getJson('/api/reactions/$matchId'));

  Future<void> react(String matchId, String emoji) async =>
      _api.putJson('/api/reactions', body: {'matchId': matchId, 'emoji': emoji});
}
