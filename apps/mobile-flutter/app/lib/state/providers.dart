import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../api/auth_repository.dart';
import '../api/models.gen.dart';
import '../api/nostragoalus_api.dart';
import '../api/token_store.dart';

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
    ref.invalidate(matchProvider);
  }
}

// --- data reads (kept alive; invalidated on auth change / mutation) ---

final competitionsProvider = FutureProvider<CompetitionsResponse>(
    (ref) => ref.watch(apiProvider).competitions());

final standingsProvider = FutureProvider<StandingsResponse>(
    (ref) => ref.watch(apiProvider).standings());

final scorersProvider =
    FutureProvider<ScorersResponse>((ref) => ref.watch(apiProvider).scorers());

final matchesProvider =
    FutureProvider<MatchesResponse>((ref) => ref.watch(apiProvider).matches());

final leaderboardProvider = FutureProvider<LeaderboardResponse>(
    (ref) => ref.watch(apiProvider).leaderboard());

final matchProvider = FutureProvider.family<MatchDetailResponse, String>(
    (ref, id) => ref.watch(apiProvider).match(id));

/// Save (or overwrite) a prediction, then refresh the reads it affects.
final savePredictionProvider = Provider<
    Future<PredictionSaveResponse> Function(String, String, PredictionInput)>((ref) {
  return (leagueId, matchId, input) async {
    final res = await ref.read(apiProvider).savePrediction(leagueId, matchId, input);
    ref.invalidate(matchProvider);
    ref.invalidate(leaderboardProvider);
    return res;
  };
});
