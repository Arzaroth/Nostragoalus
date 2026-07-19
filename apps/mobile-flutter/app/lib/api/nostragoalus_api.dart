import 'api_client.dart';
import 'models.gen.dart';

/// Typed facade over the MVP endpoints. Each method maps one route to its
/// generated response model. The competition-scoped reads take an optional
/// `competition` slug (the switcher's selection); null uses the server default.
class NostragoalusApi {
  NostragoalusApi(this._api);

  final ApiClient _api;

  Map<String, dynamic>? _comp(String? competition) =>
      competition == null ? null : {'competition': competition};

  Future<CompetitionsResponse> competitions() async =>
      CompetitionsResponse.fromJson(await _api.getJson('/api/competitions'));

  Future<StandingsResponse> standings({String? competition}) async =>
      StandingsResponse.fromJson(
          await _api.getJson('/api/competitions/standings', query: _comp(competition)));

  Future<ScorersResponse> scorers({String? competition}) async => ScorersResponse.fromJson(
      await _api.getJson('/api/competitions/scorers', query: _comp(competition)));

  Future<TeamsResponse> teams({String? competition}) async =>
      TeamsResponse.fromJson(await _api.getJson('/api/competitions/teams', query: _comp(competition)));

  Future<BracketResponse> bracket({String? competition}) async =>
      BracketResponse.fromJson(await _api.getJson('/api/competitions/bracket', query: _comp(competition)));

  Future<MatchesResponse> matches({String? competition}) async =>
      MatchesResponse.fromJson(await _api.getJson('/api/matches', query: _comp(competition)));

  /// Head-to-head compare of two players (raw; nested shape read in the UI).
  Future<Map<String, dynamic>> headToHead(String a, String b, {String? competition}) async =>
      _api.getJson('/api/head-to-head', query: {
        'a': a,
        'b': b,
        if (competition != null) 'competition': competition,
      });

  /// Crowd totals keyed by matchId -> {home, away, count}. Display-only.
  Future<Map<String, dynamic>> crowdTotals({String? competition}) async {
    final res = await _api.getJson('/api/predictions/crowd', query: _comp(competition));
    final totals = res['totals'];
    return totals is Map ? totals.cast<String, dynamic>() : const <String, dynamic>{};
  }

  Future<MatchDetailResponse> match(String id) async =>
      MatchDetailResponse.fromJson(await _api.getJson('/api/matches/$id'));

  Future<MatchTimelineResponse> matchTimeline(String id) async =>
      MatchTimelineResponse.fromJson(await _api.getJson('/api/matches/$id/timeline'));

  Future<MatchLineupsResponse> matchLineups(String id) async =>
      MatchLineupsResponse.fromJson(await _api.getJson('/api/matches/$id/lineups'));

  Future<ScorersResponse> matchScorers(String id) async =>
      ScorersResponse.fromJson(await _api.getJson('/api/matches/$id/scorers'));

  Future<MatchInsightsResponse> matchInsights(String id) async =>
      MatchInsightsResponse.fromJson(await _api.getJson('/api/matches/$id/insights'));

  Future<MatchLeagueStandingsResponse> matchLeagueStandings(String id) async =>
      MatchLeagueStandingsResponse.fromJson(
          await _api.getJson('/api/matches/$id/league-standings'));

  Future<MatchMediaResponse> matchMedia(String id) async =>
      MatchMediaResponse.fromJson(await _api.getJson('/api/matches/$id/media'));

  /// My rewards across leagues (a top-level array, read raw).
  Future<List<dynamic>> meRewards() async {
    final r = await _api.raw((dio) => dio.get<dynamic>('/api/me/rewards'));
    return r.data as List<dynamic>;
  }

  Future<CabinetResponse> cabinet(String userId) async =>
      CabinetResponse.fromJson(await _api.getJson('/api/users/$userId/cabinet'));

  Future<MeStatsResponse> meStats() async =>
      MeStatsResponse.fromJson(await _api.getJson('/api/me/stats'));

  /// Save a user preference (theme/locale/showCrowd/showOdds/skin) via better-auth.
  Future<void> updatePrefs(Map<String, dynamic> prefs) async =>
      _api.postJson('/api/auth/update-user', body: prefs);

  Future<LeaderboardResponse> leaderboard({String? competition}) async =>
      LeaderboardResponse.fromJson(
          await _api.getJson('/api/leaderboard', query: _comp(competition)));

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

  Future<LeagueDetailResponse> leagueDetail(String leagueId) async =>
      LeagueDetailResponse.fromJson(await _api.getJson('/api/leagues/$leagueId'));

  Future<void> createLeague(CreateLeagueInput input) async =>
      _api.postJson('/api/leagues', body: input.toJson());

  Future<LeagueInvitesResponse> leagueInvites(String leagueId) async =>
      LeagueInvitesResponse.fromJson(await _api.getJson('/api/leagues/$leagueId/invites'));

  Future<void> createInvite(String leagueId, {int? expiresInHours, int? maxUses}) async =>
      _api.postJson('/api/leagues/$leagueId/invites', body: {
        if (expiresInHours != null) 'expiresInHours': expiresInHours,
        if (maxUses != null) 'maxUses': maxUses,
      });

  Future<void> leaveLeague(String leagueId) async =>
      _api.postJson('/api/leagues/$leagueId/leave');

  Future<void> regenerateLeagueCode(String leagueId) async =>
      _api.postJson('/api/leagues/$leagueId/regenerate-code');

  Future<List<dynamic>> leagueRewards(String leagueId) async {
    final r = await _api.raw((dio) => dio.get<dynamic>('/api/leagues/$leagueId/rewards'));
    return r.data as List<dynamic>;
  }

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

  // --- Phase 5 ---

  Future<RoadmapResponse> roadmap() async =>
      RoadmapResponse.fromJson(await _api.getJson('/api/roadmap'));

  Future<void> voteRoadmap(String id) async => _api.postJson('/api/roadmap/$id/vote');

  Future<void> suggestRoadmap(String title, String description) async => _api
      .postJson('/api/roadmap/suggestions', body: {'title': title, 'description': description});

  Future<ChampionResponse> champion({String? competition}) async =>
      ChampionResponse.fromJson(await _api.getJson('/api/champion', query: _comp(competition)));

  Future<void> setChampion(String teamCode, String teamName) async =>
      _api.putJson('/api/champion', body: {'teamCode': teamCode, 'teamName': teamName});

  Future<BestScorerResponse> bestScorer({String? competition}) async =>
      BestScorerResponse.fromJson(await _api.getJson('/api/best-scorer', query: _comp(competition)));

  Future<CommitmentsResponse> commitments() async =>
      CommitmentsResponse.fromJson(await _api.getJson('/api/commitments'));

  Future<BotPredictionsResponse> botPredictions() async =>
      BotPredictionsResponse.fromJson(await _api.getJson('/api/bot/predictions'));

  Future<PastPicksResponse> pastPicks(String matchId) async =>
      PastPicksResponse.fromJson(await _api.getJson('/api/matches/$matchId/my-past-picks'));

  // --- E2EE chat ---

  Future<ChatIdentityResponse> chatIdentity() async =>
      ChatIdentityResponse.fromJson(await _api.getJson('/api/chat/identity'));

  Future<void> registerIdentity(String publicKey) async =>
      _api.putJson('/api/chat/identity', body: {'publicKey': publicKey});

  Future<String?> chatRecoveryBlob() async =>
      (await _api.getJson('/api/chat/recovery'))['blob'] as String?;

  Future<void> setChatRecovery(String blob) async =>
      _api.putJson('/api/chat/recovery', body: {'blob': blob});

  Future<ChatStatusResponse> chatStatus(String leagueId) async =>
      ChatStatusResponse.fromJson(await _api.getJson('/api/leagues/$leagueId/chat'));

  Future<ChatMessagesResponse> chatMessages(String leagueId) async =>
      ChatMessagesResponse.fromJson(await _api.getJson('/api/leagues/$leagueId/chat/messages'));

  Future<void> sendChat(String leagueId, String ciphertext, int epoch, {String? matchId}) async =>
      _api.postJson('/api/leagues/$leagueId/chat/messages',
          body: {'ciphertext': ciphertext, 'epoch': epoch, if (matchId != null) 'matchId': matchId});

  Future<void> requestChatKey(String leagueId) async =>
      _api.postJson('/api/leagues/$leagueId/chat/request-key');

  Future<void> reactChatMessage(String leagueId, String messageId, String emoji) async =>
      _api.putJson('/api/leagues/$leagueId/chat/react',
          body: {'messageId': messageId, 'emoji': emoji});

  // --- Account security: connected sessions (better-auth) ---

  Future<List<dynamic>> listSessions() async {
    final r = await _api.raw((dio) => dio.get<dynamic>('/api/auth/list-sessions'));
    final data = r.data;
    if (data is List) return data;
    if (data is Map && data['sessions'] is List) return data['sessions'] as List;
    return const [];
  }

  Future<void> revokeSession(String token) async =>
      _api.postJson('/api/auth/revoke-session', body: {'token': token});

  /// Keyholder: seal the current group key to members who are missing it.
  Future<void> sealChatKeys(
          String leagueId, int epoch, List<Map<String, String>> wraps) async =>
      _api.postJson('/api/leagues/$leagueId/chat/keys',
          body: {'epoch': epoch, 'wraps': wraps});

  // --- Direct messages (1:1, same identity keypair as league chat) ---

  Future<DmThreadsResponse> dmThreads() async =>
      DmThreadsResponse.fromJson(await _api.getJson('/api/dm/threads'));

  Future<DmRecipientsResponse> dmRecipients() async =>
      DmRecipientsResponse.fromJson(await _api.getJson('/api/dm/recipients'));

  /// A user's DM public key (own identity when [userId] is null).
  Future<String> dmPublicKey(String userId) async {
    final res = await _api.getJson('/api/dm/identity', query: {'userId': userId});
    return (res['identity'] as Map<String, dynamic>)['publicKey'] as String;
  }

  Future<String> createDmThread(String recipientId, List<Map<String, String>> wraps) async {
    final res = await _api.postJson('/api/dm/threads', body: {'recipientId': recipientId, 'wraps': wraps});
    return res['threadId'] as String;
  }

  Future<DmThreadResponse> dmThread(String threadId) async =>
      DmThreadResponse.fromJson(await _api.getJson('/api/dm/$threadId'));

  // DM messages share ChatMessagesResponse's shape (the generator dedups them).
  Future<ChatMessagesResponse> dmMessages(String threadId) async =>
      ChatMessagesResponse.fromJson(await _api.getJson('/api/dm/$threadId/messages'));

  Future<void> sendDm(String threadId, String ciphertext, int epoch) async =>
      _api.postJson('/api/dm/$threadId/messages', body: {'ciphertext': ciphertext, 'epoch': epoch});

  /// The key-transparency log (verified client-side against the hash chain).
  Future<Map<String, dynamic>> keysLog() async => _api.getJson('/api/keys/log');

  /// ICE/TURN servers for the voice mesh.
  Future<List<dynamic>> iceServers() async =>
      (await _api.getJson('/api/voice/ice-servers'))['iceServers'] as List;

  // --- SSO ---

  /// The SSO provider capturing an email's domain, if any ({providerId, name}).
  Future<Map<String, dynamic>> ssoCheck(String email) async =>
      _api.getJson('/api/sso/check', query: {'email': email});

  /// Start a better-auth SSO sign-in; returns the IdP authorize URL to open.
  Future<String?> ssoAuthorizeUrl(String providerId, String callbackURL) async {
    final res = await _api
        .postJson('/api/auth/sign-in/sso', body: {'providerId': providerId, 'callbackURL': callbackURL});
    return res['url'] as String?;
  }
}
