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

  Future<PredictionSaveResponse> savePrediction(
    String leagueId,
    String matchId,
    PredictionInput input,
  ) async =>
      PredictionSaveResponse.fromJson(await _api.putJson(
        '/api/leagues/$leagueId/predictions/$matchId',
        body: input.toJson(),
      ));
}
