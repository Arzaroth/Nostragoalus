import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../api/auth_repository.dart';
import '../api/models.gen.dart';
import '../api/nostragoalus_api.dart';
import '../api/token_store.dart';
import '../i18n/i18n.dart';
import '../live/live_service.dart';
import '../voice/voice_service.dart';

/// The active UI locale (defaults to English; the locale switcher sets it).
final localeProvider = StateProvider<Locale>((ref) => const Locale('en'));

/// The selected competition slug for the scoped reads (null = server default).
/// The switcher sets it; the scoped data providers watch it and refetch.
final selectedCompetitionProvider = StateProvider<String?>((ref) => null);

/// The loaded strings for the active locale (English fallback baked in).
final i18nProvider = FutureProvider<I18n>((ref) => I18n.load(ref.watch(localeProvider)));

/// One keystore-backed bearer token for the process.
final tokenStoreProvider = Provider<TokenStore>((ref) => TokenStore());

/// The shared Dio client. A 401 anywhere clears the token and refreshes auth,
/// so the UI drops to signed-out without a manual check at each call site.
final apiClientProvider = Provider<ApiClient>((ref) {
  final tokens = ref.watch(tokenStoreProvider);
  return ApiClient(
    tokens,
    onUnauthorized: () => ref.invalidate(authControllerProvider),
  );
});

final authRepositoryProvider = Provider<AuthRepository>((ref) =>
    AuthRepository(ref.watch(apiClientProvider), ref.watch(tokenStoreProvider)));

final apiProvider =
    Provider<NostragoalusApi>((ref) => NostragoalusApi(ref.watch(apiClientProvider)));

/// Signed-in user (null when signed out). `build` restores a persisted session
/// on launch; sign in/out mutate it and invalidate the cached data reads.
final authControllerProvider =
    AsyncNotifierProvider<AuthController, AuthUser?>(AuthController.new);

class AuthController extends AsyncNotifier<AuthUser?> {
  @override
  Future<AuthUser?> build() async {
    await ref.watch(tokenStoreProvider).load();
    return ref.watch(authRepositoryProvider).currentUser();
  }

  Future<void> signIn(String email, String password) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
        () => ref.read(authRepositoryProvider).signIn(email, password));
    if (state.hasValue && state.value != null) _invalidateData();
  }

  Future<void> signOut() async {
    await ref.read(authRepositoryProvider).signOut();
    state = const AsyncData(null);
    _invalidateData();
  }

  void _invalidateData() {
    ref.invalidate(competitionsProvider);
    ref.invalidate(standingsProvider);
    ref.invalidate(scorersProvider);
    ref.invalidate(matchesProvider);
    ref.invalidate(leaderboardProvider);
    ref.invalidate(leaguesProvider);
    ref.invalidate(myPredictionsProvider);
    ref.invalidate(matchProvider);
  }
}

// --- data reads (kept alive; invalidated on auth change / mutation) ---

final competitionsProvider = FutureProvider<CompetitionsResponse>(
    (ref) => ref.watch(apiProvider).competitions());

final standingsProvider = FutureProvider<StandingsResponse>((ref) =>
    ref.watch(apiProvider).standings(competition: ref.watch(selectedCompetitionProvider)));

final scorersProvider = FutureProvider<ScorersResponse>((ref) =>
    ref.watch(apiProvider).scorers(competition: ref.watch(selectedCompetitionProvider)));

final teamsProvider = FutureProvider<TeamsResponse>((ref) =>
    ref.watch(apiProvider).teams(competition: ref.watch(selectedCompetitionProvider)));

/// Team codes eliminated from the tournament, for the nations/map overlay.
final eliminatedProvider = FutureProvider<List<String>>((ref) =>
    ref.watch(apiProvider).eliminatedTeams(competition: ref.watch(selectedCompetitionProvider)));

final bracketProvider = FutureProvider<BracketResponse>((ref) =>
    ref.watch(apiProvider).bracket(competition: ref.watch(selectedCompetitionProvider)));

final matchesProvider = FutureProvider<MatchesResponse>((ref) =>
    ref.watch(apiProvider).matches(competition: ref.watch(selectedCompetitionProvider)));

/// Crowd consensus totals per match (display-only, gated on the show-crowd pref).
final crowdTotalsProvider = FutureProvider<Map<String, dynamic>>((ref) =>
    ref.watch(apiProvider).crowdTotals(competition: ref.watch(selectedCompetitionProvider)));

/// A shared card resolved by (kind, token) for the in-app viewer.
final shareCardProvider = FutureProvider.family<Map<String, dynamic>, (String, String)>(
    (ref, args) => ref.watch(apiProvider).shareCard(args.$1, args.$2));

/// Head-to-head compare of two players (a, b) in the selected competition.
final headToHeadProvider =
    FutureProvider.family<Map<String, dynamic>, (String, String)>((ref, pair) =>
        ref.watch(apiProvider).headToHead(pair.$1, pair.$2,
            competition: ref.watch(selectedCompetitionProvider)));

final leaderboardProvider = FutureProvider<LeaderboardResponse>((ref) =>
    ref.watch(apiProvider).leaderboard(competition: ref.watch(selectedCompetitionProvider)));

final leaguesProvider =
    FutureProvider<LeaguesResponse>((ref) => ref.watch(apiProvider).leagues());

/// Per-league pick completeness for the nudge banner (leagues needing picks).
final leagueCompletenessProvider = FutureProvider<List<dynamic>>((ref) => ref
    .watch(apiProvider)
    .leagueCompleteness(competition: ref.watch(selectedCompetitionProvider)));

final myPredictionsProvider =
    FutureProvider<PredictionsResponse>((ref) => ref.watch(apiProvider).myPredictions());

// --- Phase 2 ---

final publicLeaguesProvider =
    FutureProvider<PublicLeaguesResponse>((ref) => ref.watch(apiProvider).publicLeagues());

final notificationsProvider =
    FutureProvider<NotificationsResponse>((ref) => ref.watch(apiProvider).notifications());

/// Count of unread notifications, for the header badge.
final unreadCountProvider = Provider<int>((ref) => ref.watch(notificationsProvider).maybeWhen(
      data: (n) => n.unreadCount.toInt(),
      orElse: () => 0,
    ));

final analyticsProvider =
    FutureProvider<AnalyticsResponse>((ref) => ref.watch(apiProvider).analytics());

final wrappedProvider =
    FutureProvider<Map<String, dynamic>>((ref) => ref.watch(apiProvider).wrapped());

final reactionsProvider = FutureProvider.family<ReactionsResponse, String>(
    (ref, matchId) => ref.watch(apiProvider).reactions(matchId));

final leagueBoardProvider = FutureProvider.family<ModeBoardResponse, String>(
    (ref, id) => ref.watch(apiProvider).leagueBoard(id));

final leagueDetailProvider = FutureProvider.family<LeagueDetailResponse, String>(
    (ref, id) => ref.watch(apiProvider).leagueDetail(id));

final leagueInvitesProvider = FutureProvider.family<LeagueInvitesResponse, String>(
    (ref, id) => ref.watch(apiProvider).leagueInvites(id));

final leagueRewardsProvider = FutureProvider.family<List<dynamic>, String>(
    (ref, id) => ref.watch(apiProvider).leagueRewards(id));

/// The live hub connection (one per app), disposed with the provider scope.
final liveServiceProvider = Provider<LiveService>((ref) {
  final service = LiveService(ref.watch(tokenStoreProvider));
  ref.onDispose(service.dispose);
  return service;
});

/// The WebRTC voice mesh service (one per app).
final voiceServiceProvider = Provider<VoiceService>((ref) {
  final selfId = ref.watch(authControllerProvider).valueOrNull?.id ?? '';
  final service = VoiceService(ref.watch(apiProvider), ref.watch(tokenStoreProvider), selfId);
  ref.onDispose(service.dispose);
  return service;
});

/// Live viewer counts per match, pushed by `viewers:update` frames.
final viewersProvider = StateProvider<Map<String, int>>((ref) => const {});

// --- Phase 5 ---

final roadmapProvider =
    FutureProvider<RoadmapResponse>((ref) => ref.watch(apiProvider).roadmap());

final championProvider = FutureProvider<ChampionResponse>((ref) =>
    ref.watch(apiProvider).champion(competition: ref.watch(selectedCompetitionProvider)));

final bestScorerProvider = FutureProvider<BestScorerResponse>((ref) =>
    ref.watch(apiProvider).bestScorer(competition: ref.watch(selectedCompetitionProvider)));

final commitmentsProvider =
    FutureProvider<CommitmentsResponse>((ref) => ref.watch(apiProvider).commitments());

final botPredictionsProvider =
    FutureProvider<BotPredictionsResponse>((ref) => ref.watch(apiProvider).botPredictions());

final pastPicksProvider = FutureProvider.family<PastPicksResponse, String>(
    (ref, matchId) => ref.watch(apiProvider).pastPicks(matchId));

/// The match whose detail is open, so the hub keeps its room subscribed (which
/// is what makes the server count this client as a viewer).
final viewedMatchProvider = StateProvider<String?>((ref) => null);

final matchProvider = FutureProvider.family<MatchDetailResponse, String>(
    (ref, id) => ref.watch(apiProvider).match(id));

final matchTimelineProvider = FutureProvider.family<MatchTimelineResponse, String>(
    (ref, id) => ref.watch(apiProvider).matchTimeline(id));

final matchLineupsProvider = FutureProvider.family<MatchLineupsResponse, String>(
    (ref, id) => ref.watch(apiProvider).matchLineups(id));

final matchScorersProvider = FutureProvider.family<ScorersResponse, String>(
    (ref, id) => ref.watch(apiProvider).matchScorers(id));

final matchInsightsProvider = FutureProvider.family<MatchInsightsResponse, String>(
    (ref, id) => ref.watch(apiProvider).matchInsights(id));

final matchLiveDetailProvider = FutureProvider.family<Map<String, dynamic>?, String>(
    (ref, id) => ref.watch(apiProvider).matchLiveDetail(id));

/// Calendar-feed subscription URLs for the signed-in user.
final feedSubscriptionProvider =
    FutureProvider<Map<String, dynamic>>((ref) => ref.watch(apiProvider).feedSubscription());

/// Public preview for an invite token (league name + member count).
final invitePreviewProvider = FutureProvider.family<Map<String, dynamic>, String>(
    (ref, token) => ref.watch(apiProvider).invitePreview(token));

final cabinetProvider = FutureProvider.family<CabinetResponse, String>(
    (ref, userId) => ref.watch(apiProvider).cabinet(userId));

final meStatsProvider = FutureProvider<MeStatsResponse>((ref) => ref.watch(apiProvider).meStats());

final sessionsProvider = FutureProvider<List<dynamic>>((ref) => ref.watch(apiProvider).listSessions());

final matchLeagueStandingsProvider =
    FutureProvider.family<MatchLeagueStandingsResponse, String>(
        (ref, id) => ref.watch(apiProvider).matchLeagueStandings(id));

final matchMediaProvider = FutureProvider.family<MatchMediaResponse, String>(
    (ref, id) => ref.watch(apiProvider).matchMedia(id));

final meRewardsProvider = FutureProvider<List<dynamic>>((ref) => ref.watch(apiProvider).meRewards());

/// Save (or overwrite) a prediction, then refresh the reads it affects.
final savePredictionProvider = Provider<
    Future<PredictionSaveResponse> Function(String, String, PredictionInput)>((ref) {
  return (leagueId, matchId, input) async {
    final res = await ref.read(apiProvider).savePrediction(leagueId, matchId, input);
    ref.invalidate(matchProvider);
    ref.invalidate(leaderboardProvider);
    ref.invalidate(myPredictionsProvider);
    return res;
  };
});
