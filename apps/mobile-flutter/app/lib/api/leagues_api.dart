import 'api_client.dart';
import 'models.gen.dart';

/// Leagues: membership and admin, the boards they rank, the prizes they award,
/// and the predictions a member saves against them.
extension LeaguesApi on ApiClient {
  Future<LeaguesResponse> leagues({String? competition}) async =>
      LeaguesResponse.fromJson(await getJson('/api/leagues', query: competitionQuery(competition)));

  Future<PublicLeaguesResponse> publicLeagues({String? competition}) async =>
      PublicLeaguesResponse.fromJson(
          await getJson('/api/leagues/public', query: competitionQuery(competition)));

  Future<LeagueDetailResponse> leagueDetail(String leagueId) async =>
      LeagueDetailResponse.fromJson(await getJson('/api/leagues/$leagueId'));

  Future<void> createLeague(CreateLeagueInput input) async =>
      postJson('/api/leagues', body: input.toJson());

  /// Update league settings (name, visibility, description, featuredTeamCode,
  /// mode, lives) - only the provided keys change.
  Future<void> updateLeague(String leagueId, Map<String, dynamic> body) async =>
      putJson('/api/leagues/$leagueId', body: body);

  Future<void> joinLeagueByCode(String code) async =>
      postJson('/api/leagues/join', body: {'code': code});

  Future<void> joinLeague(String leagueId) async => postJson('/api/leagues/$leagueId/join');

  Future<void> leaveLeague(String leagueId) async => postJson('/api/leagues/$leagueId/leave');

  Future<void> regenerateLeagueCode(String leagueId) async =>
      postJson('/api/leagues/$leagueId/regenerate-code');

  Future<LeagueInvitesResponse> leagueInvites(String leagueId) async =>
      LeagueInvitesResponse.fromJson(await getJson('/api/leagues/$leagueId/invites'));

  Future<void> createInvite(String leagueId, {int? expiresInHours, int? maxUses}) async =>
      postJson('/api/leagues/$leagueId/invites', body: {
        if (expiresInHours != null) 'expiresInHours': expiresInHours,
        if (maxUses != null) 'maxUses': maxUses,
      });

  Future<void> deleteInvite(String leagueId, String inviteId) async =>
      deleteJson('/api/leagues/$leagueId/invites/$inviteId');

  /// Public invite preview for a join landing (league name + member count).
  Future<Map<String, dynamic>> invitePreview(String token) async =>
      getJson('/api/leagues/invite/$token');

  /// Accept an invite token; returns the joined league.
  Future<Map<String, dynamic>> acceptInvite(String token) async =>
      postJson('/api/leagues/invite/$token/accept');

  Future<void> setMemberRole(String leagueId, String userId, String role) async =>
      putJson('/api/leagues/$leagueId/members/$userId', body: {'role': role});

  Future<void> removeMember(String leagueId, String userId) async =>
      deleteJson('/api/leagues/$leagueId/members/$userId');

  Future<void> transferOwnership(String leagueId, String userId) async =>
      postJson('/api/leagues/$leagueId/transfer-ownership', body: {'userId': userId});

  /// Replace the league's prize set (each item {type,label,note?,link?}); a blank
  /// label deletes that criterion's prize.
  Future<void> updateLeagueRewards(String leagueId, List<Map<String, dynamic>> items) async =>
      putJson('/api/leagues/$leagueId/rewards', body: {'items': items});

  Future<List<LeagueReward>> leagueRewards(String leagueId) async =>
      parseLeagueRewardList(await getList('/api/leagues/$leagueId/rewards'));

  /// Reward ranking for one criterion type (raw; nested shape read in the UI).
  Future<Map<String, dynamic>> rewardRanking(String leagueId, String type) async =>
      getJson('/api/leagues/$leagueId/rewards/$type/ranking');

  Future<ModeBoardResponse> leagueBoard(String leagueId) async =>
      ModeBoardResponse.fromJson(await getJson('/api/leagues/$leagueId/mode-board'));

  /// The points ranking. With [league], only that league's members are ranked
  /// and the movement arrows are within-league deltas.
  Future<LeaderboardResponse> leaderboard({String? competition, String? league}) async =>
      LeaderboardResponse.fromJson(await getJson('/api/leaderboard',
          query: leagueScopedQuery(competition, league)));

  /// Per-league pick completeness (which leagues still need picks/exact/stake).
  Future<List<LeagueCompletenessResponseLeague>> leagueCompleteness({String? competition}) async =>
      LeagueCompletenessResponse.fromJson(
              await getJson('/api/leagues/completeness', query: competitionQuery(competition)))
          .leagues;

  Future<PredictionsResponse> myPredictions({String? competition}) async =>
      PredictionsResponse.fromJson(
          await getJson('/api/predictions', query: competitionQuery(competition)));

  Future<PredictionSaveResponse> savePrediction(
    String leagueId,
    String matchId,
    PredictionInput input,
  ) async =>
      PredictionSaveResponse.fromJson(await putJson(
        '/api/leagues/$leagueId/predictions/$matchId',
        body: input.toJson(),
      ));

  /// Set or clear this match as the league's joker (one per league).
  Future<void> setJoker(String leagueId, String matchId, bool isJoker) async {
    await putJson('/api/leagues/$leagueId/joker', body: {'matchId': matchId, 'isJoker': isJoker});
  }
}
