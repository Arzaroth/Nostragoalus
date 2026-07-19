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

  /// Calendar-feed subscription URLs ({url, webcalUrl}) for the signed-in user.
  Future<Map<String, dynamic>> feedSubscription() async =>
      _api.getJson('/api/feed/subscription');

  /// Revoke every prior calendar URL and mint a fresh one.
  Future<Map<String, dynamic>> regenerateFeed() async =>
      _api.postJson('/api/feed/regenerate');

  /// Upstream live match detail (opaque provider blob; null when unavailable).
  Future<Map<String, dynamic>?> matchLiveDetail(String id) async {
    final res = await _api.getJson('/api/matches/$id/live-detail');
    final d = res['detail'];
    return d is Map ? d.cast<String, dynamic>() : null;
  }

  /// Mint a share token for the caller's own analytics / wrapped / profile card.
  /// Returns the token used to build the public /a|/s|/p landing URL.
  Future<String> mintAnalyticsShare({String? competition}) async =>
      (await _api.postJson('/api/share/analytics-mint', body: _comp(competition) ?? {}))['token']
          .toString();

  Future<String> mintWrappedShare({String? competition}) async =>
      (await _api.postJson('/api/share/wrapped-mint', body: _comp(competition) ?? {}))['token']
          .toString();

  Future<String> mintProfileShare({String? competition}) async =>
      (await _api.postJson('/api/share/profile-mint', body: _comp(competition) ?? {}))['token']
          .toString();

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

  /// Replace the showcase (ordered, max 3 earned achievement keys) for a competition.
  Future<void> setShowcase(List<String> keys, {String? competition}) async =>
      _api.putJson('/api/showcase', body: {
        if (competition != null) 'competition': competition,
        'items': [for (final k in keys) {'achievementKey': k}],
      });

  Future<CabinetResponse> cabinet(String userId) async =>
      CabinetResponse.fromJson(await _api.getJson('/api/users/$userId/cabinet'));

  Future<MeStatsResponse> meStats() async =>
      MeStatsResponse.fromJson(await _api.getJson('/api/me/stats'));

  /// Save a user preference (theme/locale/showCrowd/showOdds/skin) via better-auth.
  Future<void> updatePrefs(Map<String, dynamic> prefs) async =>
      _api.postJson('/api/auth/update-user', body: prefs);

  /// Resend the email-verification link to the given address.
  Future<void> sendVerificationEmail(String email) async =>
      _api.postJson('/api/auth/send-verification-email',
          body: {'email': email, 'callbackURL': '/verify-email'});

  /// Mark the one-time onboarding tour finished/skipped for the caller.
  Future<void> dismissOnboardingTour() async => _api.postJson('/api/me/onboarding-tour');

  /// Update the display name and/or avatar (a data: URL, or null to clear).
  Future<void> updateProfile({String? name, String? imageDataUrl}) async =>
      _api.postJson('/api/auth/update-user', body: {
        if (name != null) 'name': name,
        if (imageDataUrl != null) 'image': imageDataUrl,
      });

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

  /// Public invite preview for a join landing (league name + member count).
  Future<Map<String, dynamic>> invitePreview(String token) async =>
      _api.getJson('/api/leagues/invite/$token');

  /// Accept an invite token; returns the joined league.
  Future<Map<String, dynamic>> acceptInvite(String token) async =>
      _api.postJson('/api/leagues/invite/$token/accept');

  /// Update league settings (name, visibility, description, featuredTeamCode,
  /// mode, lives) - only the provided keys change.
  Future<void> updateLeague(String leagueId, Map<String, dynamic> body) async =>
      _api.putJson('/api/leagues/$leagueId', body: body);

  Future<void> deleteInvite(String leagueId, String inviteId) async =>
      _api.deleteJson('/api/leagues/$leagueId/invites/$inviteId');

  Future<void> setMemberRole(String leagueId, String userId, String role) async =>
      _api.putJson('/api/leagues/$leagueId/members/$userId', body: {'role': role});

  Future<void> removeMember(String leagueId, String userId) async =>
      _api.deleteJson('/api/leagues/$leagueId/members/$userId');

  Future<void> transferOwnership(String leagueId, String userId) async =>
      _api.postJson('/api/leagues/$leagueId/transfer-ownership', body: {'userId': userId});

  /// Reward ranking for one criterion type (raw; nested shape read in the UI).
  Future<Map<String, dynamic>> rewardRanking(String leagueId, String type) async =>
      _api.getJson('/api/leagues/$leagueId/rewards/$type/ranking');

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

  /// Hard-reset the chat identity to a fresh keypair, revoking old sealed keys.
  Future<void> resetChatIdentity(String publicKey) async =>
      _api.postJson('/api/chat/identity/reset', body: {'publicKey': publicKey});

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

  Future<void> editChatMessage(String leagueId, String messageId, String ciphertext) async =>
      _api.postJson('/api/leagues/$leagueId/chat/edit',
          body: {'messageId': messageId, 'ciphertext': ciphertext});

  /// The moderation queue (owner/mod): reported messages with ciphertext + epoch.
  Future<List<dynamic>> chatReports(String leagueId) async =>
      (await _api.getJson('/api/leagues/$leagueId/chat/reports'))['reports'] as List<dynamic>;

  Future<void> moderateChatMessage(String leagueId, String messageId, String action) async =>
      _api.postJson('/api/leagues/$leagueId/chat/moderate',
          body: {'messageId': messageId, 'action': action});

  Future<void> reportChatMessage(String leagueId, String messageId) async =>
      _api.postJson('/api/leagues/$leagueId/chat/report',
          body: {'messageId': messageId, 'reported': true});

  // --- Account security: connected sessions (better-auth) ---

  Future<List<dynamic>> listSessions() async {
    final r = await _api.raw((dio) => dio.get<dynamic>('/api/auth/list-sessions'));
    final data = r.data;
    if (data is List) return data;
    if (data is Map && data['sessions'] is List) return data['sessions'] as List;
    return const [];
  }

  /// Begin 2FA enrolment: returns {totpURI, backupCodes}. Confirm with verifyTotp.
  Future<Map<String, dynamic>> twoFactorEnable(String password) async =>
      _api.postJson('/api/auth/two-factor/enable', body: {'password': password});

  Future<void> twoFactorVerify(String code) async =>
      _api.postJson('/api/auth/two-factor/verify-totp', body: {'code': code});

  Future<Map<String, dynamic>> twoFactorBackupCodes(String password) async =>
      _api.postJson('/api/auth/two-factor/generate-backup-codes', body: {'password': password});

  Future<void> twoFactorDisable(String password) async =>
      _api.postJson('/api/auth/two-factor/disable', body: {'password': password});

  /// Check a current TOTP code (used to gate disabling 2FA).
  Future<bool> confirmTotp(String code) async {
    final r = await _api.postJson('/api/me/confirm-totp', body: {'code': code});
    return r['valid'] == true;
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

  /// Set (or clear, with null) the caller's reaction on a DM message. `emoji` is
  /// a REACTION_EMOJIS code (FIRE/GOAL/WOW/LAUGH/SAD/ANGRY).
  Future<void> reactDm(String threadId, String messageId, String? emoji) async =>
      _api.putJson('/api/dm/$threadId/react', body: {'messageId': messageId, 'emoji': emoji});

  /// Mark the whole thread read for the caller.
  Future<void> markDmRead(String threadId) async =>
      _api.postJson('/api/dm/$threadId/read');

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
