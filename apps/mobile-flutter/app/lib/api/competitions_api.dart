import 'api_client.dart';
import 'models.gen.dart';

/// Competition-scoped reads: the tournament itself (teams, standings, bracket,
/// scorers) and the season-long picks made against it (champion, Golden Boot).
extension CompetitionsApi on ApiClient {
  Future<CompetitionsResponse> competitions() async =>
      CompetitionsResponse.fromJson(await getJson('/api/competitions'));

  Future<StandingsResponse> standings({String? competition}) async =>
      StandingsResponse.fromJson(await getJson('/api/competitions/standings',
          query: competitionQuery(competition)));

  Future<ScorersResponse> scorers({String? competition}) async => ScorersResponse.fromJson(
      await getJson('/api/competitions/scorers', query: competitionQuery(competition)));

  /// Team codes certainly out of the tournament (knockout losers, non-qualifiers).
  Future<List<String>> eliminatedTeams({String? competition}) async =>
      EliminatedResponse.fromJson(await getJson('/api/competitions/eliminated',
              query: competitionQuery(competition)))
          .codes;

  Future<TeamsResponse> teams({String? competition}) async => TeamsResponse.fromJson(
      await getJson('/api/competitions/teams', query: competitionQuery(competition)));

  Future<BracketResponse> bracket({String? competition}) async => BracketResponse.fromJson(
      await getJson('/api/competitions/bracket', query: competitionQuery(competition)));

  /// A team's squad, for the best-scorer pick.
  Future<List<Squad>> teamSquad(String code, {String? competition}) async =>
      TeamDetailResponse.fromJson(
              await getJson('/api/teams/$code', query: competitionQuery(competition)))
          .squad;

  Future<ChampionResponse> champion({String? competition}) async => ChampionResponse.fromJson(
      await getJson('/api/champion', query: competitionQuery(competition)));

  Future<void> setChampion(String teamCode, String teamName) async =>
      putJson('/api/champion', body: {'teamCode': teamCode, 'teamName': teamName});

  Future<BestScorerResponse> bestScorer({String? competition}) async =>
      BestScorerResponse.fromJson(
          await getJson('/api/best-scorer', query: competitionQuery(competition)));

  /// Save the Golden Boot pick.
  Future<void> setBestScorer(
          {required String playerId,
          required String playerName,
          String? teamCode,
          required String teamName,
          String? competition}) async =>
      putJson('/api/best-scorer', body: {
        'playerId': playerId,
        'playerName': playerName,
        if (teamCode != null) 'teamCode': teamCode,
        'teamName': teamName,
        if (competition != null) 'competition': competition,
      });

  /// The tamper-evidence commitments published for the competition's scores.
  Future<CommitmentsResponse> commitments() async =>
      CommitmentsResponse.fromJson(await getJson('/api/commitments'));
}
