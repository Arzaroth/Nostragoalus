import 'dart:ui' show PlatformDispatcher;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api.dart';
import '../api/auth_repository.dart';
import '../api/models.gen.dart';
import '../api/token_store.dart';
import '../i18n/i18n.dart';
import '../live/live_service.dart';
import '../voice/voice_service.dart';
import 'app_prefs.dart';

// The API is a set of extensions on ApiClient, and an extension method only
// resolves where its library is imported - so every screen that reads
// [apiProvider] would otherwise need its own api import.
export '../api/api.dart' hide ApiClient;

/// Persisted UI preferences. `main()` overrides this with an instance whose
/// `load()` already ran, so the providers below can seed synchronously.
final appPrefsProvider = Provider<AppPrefs>((ref) => AppPrefs());

/// The active UI locale: the stored choice, else the device language, else
/// English. [prefsPersistenceProvider] writes back whatever the switcher sets.
final localeProvider = StateProvider<Locale>((ref) => Locale(resolveLocaleCode(
    ref.watch(appPrefsProvider).locale ??
        PlatformDispatcher.instance.locale.languageCode)));

/// Narrows any language tag to one of the five shipped locales.
String resolveLocaleCode(String code) =>
    supportedLocales.any((l) => l.languageCode == code) ? code : 'en';

/// The selected competition slug for the scoped reads (null = server default).
/// The switcher sets it; the scoped data providers watch it and refetch. The
/// choice is persisted, matching the web app.
final selectedCompetitionProvider =
    StateProvider<String?>((ref) => ref.watch(appPrefsProvider).competition);

/// Writes both UI preferences back to the store whenever they change. The root
/// widget watches it once; it has no value of its own.
final prefsPersistenceProvider = Provider<void>((ref) {
  final prefs = ref.watch(appPrefsProvider);
  ref.listen(localeProvider, (_, next) => prefs.setLocale(next.languageCode));
  ref.listen(selectedCompetitionProvider, (_, next) => prefs.setCompetition(next));
});

/// The loaded strings for the active locale (English fallback baked in).
final i18nProvider = FutureProvider<I18n>((ref) => I18n.load(ref.watch(localeProvider)));

/// One keystore-backed bearer token for the process.
final tokenStoreProvider = Provider<TokenStore>((ref) => TokenStore());

/// The shared Dio client. A 401 anywhere clears the token and refreshes auth,
/// so the UI drops to signed-out without a manual check at each call site.
final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(
    ref.watch(tokenStoreProvider),
    dio: ref.watch(dioProvider),
    // A dead session drops to signed-out. It bumps a counter rather than
    // invalidating the auth controller directly: that controller is a dependent
    // of this provider, and riverpod (rightly) refuses to let a provider
    // invalidate something that depends on it.
    onUnauthorized: () => ref.read(sessionRevokedProvider.notifier).state++,
  );
});

/// Bumped whenever a 401 proves the stored session is dead. [AuthController]
/// watches it, so the app re-reads the session and drops to signed-out.
final sessionRevokedProvider = StateProvider<int>((ref) => 0);

/// Flushes every cached read whenever the signed-in identity changes - sign-in,
/// sign-out, or a 401 that killed the session - so no personal data outlives
/// the account it belongs to. Watched once by the root widget.
final accountCacheGuardProvider = Provider<void>((ref) {
  ref.listen(authControllerProvider, (previous, next) {
    if (next.isLoading) return;
    if (previous?.valueOrNull?.id == next.valueOrNull?.id) return;
    flushAccountCaches(ref);
  });
});

/// The HTTP transport, so a test can drive the whole provider graph through a
/// fake adapter instead of overriding the API facade.
final dioProvider = Provider<Dio>((ref) => Dio());

/// Drops every cached read of the current account. Every data provider in this
/// file (and in chat/dm/kt) watches [apiProvider], so invalidating that one
/// flushes all of them - including providers added later, which a
/// hand-maintained list would miss. The live StateProviders hold other users'
/// presence and are reset here because nothing refetches them.
void flushAccountCaches(Ref ref) {
  ref.invalidate(apiProvider);
  ref.invalidate(viewersProvider);
  ref.invalidate(presenceProvider);
  ref.invalidate(typingProvider);
  ref.invalidate(viewedMatchProvider);
}

final authRepositoryProvider = Provider<AuthRepository>((ref) =>
    AuthRepository(ref.watch(apiClientProvider), ref.watch(tokenStoreProvider)));

/// The API surface every data provider reads through - one `extension` per
/// feature over [ApiClient] (see `api/api.dart`). It is its own client, not
/// [apiClientProvider]'s: invalidating it must hand out a DIFFERENT instance, or
/// riverpod sees an unchanged value and leaves every cached read in place. The
/// auth wiring is identical (same token store, same 401 path).
final apiProvider = Provider<ApiClient>((ref) => ApiClient(
      ref.watch(tokenStoreProvider),
      dio: ref.watch(dioProvider),
      onUnauthorized: () => ref.read(sessionRevokedProvider.notifier).state++,
    ));

/// Signed-in user (null when signed out). `build` restores a persisted session
/// on launch; sign in/out mutate it and invalidate the cached data reads.
final authControllerProvider =
    AsyncNotifierProvider<AuthController, AuthUser?>(AuthController.new);

class AuthController extends AsyncNotifier<AuthUser?> {
  @override
  Future<AuthUser?> build() async {
    ref.watch(sessionRevokedProvider);
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

  void _invalidateData() => flushAccountCaches(ref);
}

// --- data reads (invalidated on auth change / mutation) ---

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
final crowdTotalsProvider = FutureProvider<Map<String, CrowdResponseTotal>>((ref) =>
    ref.watch(apiProvider).crowdTotals(competition: ref.watch(selectedCompetitionProvider)));

/// A shared card resolved by (kind, token) for the in-app viewer.
final shareCardProvider =
    FutureProvider.autoDispose.family<Map<String, dynamic>, (String, String)>(
        (ref, args) => ref.watch(apiProvider).shareCard(args.$1, args.$2));

/// Head-to-head compare of two players (a, b) in the selected competition.
final headToHeadProvider =
    FutureProvider.autoDispose.family<Map<String, dynamic>, (String, String)>((ref, pair) =>
        ref.watch(apiProvider).headToHead(pair.$1, pair.$2,
            competition: ref.watch(selectedCompetitionProvider)));

final leaderboardProvider = FutureProvider<LeaderboardResponse>((ref) =>
    ref.watch(apiProvider).leaderboard(competition: ref.watch(selectedCompetitionProvider)));

final leaguesProvider =
    FutureProvider<LeaguesResponse>((ref) => ref.watch(apiProvider).leagues());

/// Per-league pick completeness for the nudge banner (leagues needing picks).
final leagueCompletenessProvider =
    FutureProvider<List<LeagueCompletenessResponseLeague>>((ref) => ref
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

final reactionsProvider = FutureProvider.autoDispose.family<ReactionsResponse, String>(
    (ref, matchId) => ref.watch(apiProvider).reactions(matchId));

final leagueBoardProvider = FutureProvider.autoDispose.family<ModeBoardResponse, String>(
    (ref, id) => ref.watch(apiProvider).leagueBoard(id));

/// Kept alive deliberately: the chat screen reads the member list off this
/// cache without watching it (for @-mention completion), so it must survive
/// being unwatched.
final leagueDetailProvider = FutureProvider.family<LeagueDetailResponse, String>(
    (ref, id) => ref.watch(apiProvider).leagueDetail(id));

final leagueInvitesProvider = FutureProvider.autoDispose.family<LeagueInvitesResponse, String>(
    (ref, id) => ref.watch(apiProvider).leagueInvites(id));

final leagueRewardsProvider = FutureProvider.autoDispose.family<List<LeagueReward>, String>(
    (ref, id) => ref.watch(apiProvider).leagueRewards(id));

/// The live hub connection (one per app), disposed with the provider scope.
/// It holds no session state of its own: `connect()` reads the current bearer
/// token, and the shell disconnects it on sign-out, so the next account gets a
/// fresh socket rather than one still authenticated as the previous user.
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

/// Presence per user (userId -> 'active' | 'idle' | 'offline'), from the hub's
/// presence:snapshot + presence:update frames. Absent = offline.
final presenceProvider = StateProvider<Map<String, String>>((ref) => const {});

/// Last-seen typing time keyed "leagueId|userId", from `chat:typing` frames. A
/// consumer treats an entry as active while it is under a few seconds old; the
/// frame router prunes entries older than 10s on every write, so the map cannot
/// grow past the users currently typing.
final typingProvider = StateProvider<Map<String, DateTime>>((ref) => const {});

// --- Phase 5 ---

final roadmapProvider =
    FutureProvider<RoadmapResponse>((ref) => ref.watch(apiProvider).roadmap());

final championProvider = FutureProvider<ChampionResponse>((ref) =>
    ref.watch(apiProvider).champion(competition: ref.watch(selectedCompetitionProvider)));

final bestScorerProvider = FutureProvider<BestScorerResponse>((ref) =>
    ref.watch(apiProvider).bestScorer(competition: ref.watch(selectedCompetitionProvider)));

/// A team's squad for the best-scorer picker (keyed by team code).
final squadProvider = FutureProvider.autoDispose.family<List<Squad>, String>((ref, code) => ref
    .watch(apiProvider)
    .teamSquad(code, competition: ref.watch(selectedCompetitionProvider)));

final commitmentsProvider =
    FutureProvider<CommitmentsResponse>((ref) => ref.watch(apiProvider).commitments());

final botPredictionsProvider =
    FutureProvider<BotPredictionsResponse>((ref) => ref.watch(apiProvider).botPredictions());

final pastPicksProvider = FutureProvider.autoDispose.family<PastPicksResponse, String>(
    (ref, matchId) => ref.watch(apiProvider).pastPicks(matchId));

/// The match whose detail is open. The shell reports it to the hub with a
/// `viewing` frame, which is what the server's "N watching now" counts.
final viewedMatchProvider = StateProvider<String?>((ref) => null);

final matchProvider = FutureProvider.autoDispose.family<MatchDetailResponse, String>(
    (ref, id) => ref.watch(apiProvider).match(id));

final matchTimelineProvider = FutureProvider.autoDispose.family<MatchTimelineResponse, String>(
    (ref, id) => ref.watch(apiProvider).matchTimeline(id));

final matchLineupsProvider = FutureProvider.autoDispose.family<MatchLineupsResponse, String>(
    (ref, id) => ref.watch(apiProvider).matchLineups(id));

final matchScorersProvider = FutureProvider.autoDispose.family<MatchScorersResponse, String>(
    (ref, id) => ref.watch(apiProvider).matchScorers(id));

final matchInsightsProvider = FutureProvider.autoDispose.family<MatchInsightsResponse, String>(
    (ref, id) => ref.watch(apiProvider).matchInsights(id));

final matchLiveDetailProvider = FutureProvider.autoDispose
    .family<Detail?, String>((ref, id) => ref.watch(apiProvider).matchLiveDetail(id));

/// Calendar-feed subscription URLs for the signed-in user.
final feedSubscriptionProvider =
    FutureProvider<FeedSubscriptionResponse>((ref) => ref.watch(apiProvider).feedSubscription());

/// Public preview for an invite token (league name + member count).
final invitePreviewProvider = FutureProvider.autoDispose.family<Map<String, dynamic>, String>(
    (ref, token) => ref.watch(apiProvider).invitePreview(token));

final cabinetProvider = FutureProvider.autoDispose.family<CabinetResponse, String>(
    (ref, userId) => ref.watch(apiProvider).cabinet(userId));

final meStatsProvider = FutureProvider<MeStatsResponse>((ref) => ref.watch(apiProvider).meStats());

final sessionsProvider = FutureProvider<List<dynamic>>((ref) => ref.watch(apiProvider).listSessions());

final matchLeagueStandingsProvider =
    FutureProvider.autoDispose.family<MatchLeagueStandingsResponse, String>(
        (ref, id) => ref.watch(apiProvider).matchLeagueStandings(id));

final matchMediaProvider = FutureProvider.autoDispose.family<MatchMediaResponse, String>(
    (ref, id) => ref.watch(apiProvider).matchMedia(id));

final meRewardsProvider = FutureProvider<List<MeReward>>((ref) => ref.watch(apiProvider).meRewards());

// --- mutations ---
//
// One canonical function per write, owning the invalidation set. A screen that
// hand-rolls the same call picks its own subset and drifts from the web app's
// contract (apps/web-nuxt/app/composables/*), which is exactly how the
// prediction save ended up refreshing two of the six reads it affects.

/// Save (or overwrite) a prediction, then refresh the reads it affects. Mirrors
/// `usePredictions.ts` `upsert`: predictions, matches, mode board, completeness.
final savePredictionProvider = Provider<
    Future<PredictionSaveResponse> Function(String, String, PredictionInput)>((ref) {
  return (leagueId, matchId, input) async {
    final res = await ref.read(apiProvider).savePrediction(leagueId, matchId, input);
    ref.invalidate(myPredictionsProvider);
    ref.invalidate(matchesProvider);
    ref.invalidate(matchProvider(matchId));
    ref.invalidate(leaderboardProvider);
    ref.invalidate(leagueBoardProvider(leagueId));
    ref.invalidate(leagueCompletenessProvider);
    return res;
  };
});

/// Flag or unflag a pick as the joker. Mirrors `usePredictions.ts` `setJoker`
/// (predictions only), plus the match the joker sits on.
final setJokerProvider = Provider<Future<void> Function(String, String, bool)>((ref) {
  return (leagueId, matchId, isJoker) async {
    await ref.read(apiProvider).setJoker(leagueId, matchId, isJoker);
    ref.invalidate(myPredictionsProvider);
    ref.invalidate(matchProvider(matchId));
    ref.invalidate(leagueBoardProvider(leagueId));
  };
});

/// Pick the tournament champion (scored at the final).
final setChampionProvider = Provider<Future<void> Function(String, String)>((ref) {
  return (teamCode, teamName) async {
    await ref.read(apiProvider).setChampion(teamCode, teamName);
    ref.invalidate(championProvider);
    ref.invalidate(leaderboardProvider);
  };
});

/// Pick the golden-boot player.
final setBestScorerProvider = Provider<
    Future<void> Function({
      required String playerId,
      required String playerName,
      required String teamName,
      String? teamCode,
    })>((ref) {
  return ({required playerId, required playerName, required teamName, teamCode}) async {
    await ref.read(apiProvider).setBestScorer(
          playerId: playerId,
          playerName: playerName,
          teamName: teamName,
          teamCode: teamCode,
          competition: ref.read(selectedCompetitionProvider),
        );
    ref.invalidate(bestScorerProvider);
    ref.invalidate(leaderboardProvider);
  };
});

/// Join a league by id (public listing) or by invite code. Mirrors
/// `useLeagues.ts`: the membership change moves the leaderboard too.
final joinLeagueProvider = Provider<Future<void> Function({String? leagueId, String? code})>((ref) {
  return ({leagueId, code}) async {
    final api = ref.read(apiProvider);
    if (leagueId != null) {
      await api.joinLeague(leagueId);
    } else if (code != null) {
      await api.joinLeagueByCode(code);
    } else {
      throw ArgumentError('joinLeague needs a leagueId or a code');
    }
    ref.invalidate(leaguesProvider);
    ref.invalidate(publicLeaguesProvider);
    ref.invalidate(leaderboardProvider);
    ref.invalidate(leagueCompletenessProvider);
  };
});

final leaveLeagueProvider = Provider<Future<void> Function(String)>((ref) {
  return (leagueId) async {
    await ref.read(apiProvider).leaveLeague(leagueId);
    ref.invalidate(leaguesProvider);
    ref.invalidate(publicLeaguesProvider);
    ref.invalidate(leaderboardProvider);
    ref.invalidate(leagueCompletenessProvider);
  };
});

/// Mark notifications read; the header badge reads off the same provider.
final markNotificationsReadProvider =
    Provider<Future<void> Function({List<String>? ids, bool all})>((ref) {
  return ({ids, all = false}) async {
    await ref.read(apiProvider).markNotificationsRead(ids: ids, all: all);
    ref.invalidate(notificationsProvider);
  };
});
