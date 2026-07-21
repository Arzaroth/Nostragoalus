import 'api_client.dart';
import 'models.gen.dart';

/// The account-wide pick for a match, which is what a NORMAL league scores.
///
/// The per-league routes in [LeaguesApi] are an OVERRIDE and the server rejects
/// them outside easy/hard/hardcore ("per-league picks are only available in
/// easy, hard and hardcore leagues"), so the mode decides which pair is used.
extension PredictionsApi on ApiClient {
  Future<PredictionSaveResponse> savePredictionGlobal(
    String matchId,
    PredictionInput input,
  ) async =>
      PredictionSaveResponse.fromJson(await putJson(
        '/api/predictions',
        body: {'matchId': matchId, ...input.toJson()},
      ));

  Future<void> setJokerGlobal(String matchId, bool isJoker) async {
    await putJson('/api/predictions/joker', body: {'matchId': matchId, 'isJoker': isJoker});
  }
}
