import 'api_client.dart';
import 'models.gen.dart';

/// The signed-in account's own view: profile and preferences, stats, trophies,
/// rewards, notifications, analytics, and the public roadmap it can vote on.
extension MeApi on ApiClient {
  Future<MeStatsResponse> meStats({String? competition}) async => MeStatsResponse.fromJson(
      await getJson('/api/me/stats', query: competitionQuery(competition)));

  Future<AnalyticsResponse> analytics({String? competition}) async => AnalyticsResponse.fromJson(
      await getJson('/api/me/analytics', query: competitionQuery(competition)));

  /// Wrapped is a top-level oneOf (ready vs not-ready); returned raw.
  Future<Map<String, dynamic>> wrapped({String? competition}) async =>
      getJson('/api/me/wrapped', query: competitionQuery(competition));

  /// Head-to-head compare of two players (raw; nested shape read in the UI).
  Future<Map<String, dynamic>> headToHead(String a, String b, {String? competition}) async =>
      getJson('/api/head-to-head', query: {
        'a': a,
        'b': b,
        if (competition != null) 'competition': competition,
      });

  /// My rewards across leagues (a top-level array).
  Future<List<MeReward>> meRewards() async => parseMeRewardList(await getList('/api/me/rewards'));

  Future<CabinetResponse> cabinet(String userId, {String? competition}) async =>
      CabinetResponse.fromJson(
          await getJson('/api/users/$userId/cabinet', query: competitionQuery(competition)));

  /// Replace the showcase (ordered, max 3 earned achievement keys) for a competition.
  Future<void> setShowcase(List<String> keys, {String? competition}) async =>
      putJson('/api/showcase', body: {
        if (competition != null) 'competition': competition,
        'items': [for (final k in keys) {'achievementKey': k}],
      });

  Future<NotificationsResponse> notifications() async =>
      NotificationsResponse.fromJson(await getJson('/api/notifications'));

  Future<void> markNotificationsRead({List<String>? ids, bool all = false}) async =>
      postJson('/api/notifications/read', body: all ? {'all': true} : {'ids': ids ?? []});

  /// Save a user preference (theme/locale/showCrowd/showOdds/skin) via better-auth.
  /// The Android build the site publishes, for the manual update check.
  /// Public: it answers signed out too.
  Future<Map<String, dynamic>> androidRelease() async => getJson('/api/app/android');

  Future<void> updatePrefs(Map<String, dynamic> prefs) async =>
      postJson('/api/auth/update-user', body: prefs);

  /// Update the display name and/or avatar (a data: URL, or null to clear).
  Future<void> updateProfile({String? name, String? imageDataUrl}) async =>
      postJson('/api/auth/update-user', body: {
        if (name != null) 'name': name,
        if (imageDataUrl != null) 'image': imageDataUrl,
      });

  /// Resend the email-verification link to the given address.
  Future<void> sendVerificationEmail(String email) async => postJson(
      '/api/auth/send-verification-email',
      body: {'email': email, 'callbackURL': '/verify-email'});

  /// Mark the one-time onboarding tour finished/skipped for the caller.
  Future<void> dismissOnboardingTour() async => postJson('/api/me/onboarding-tour');

  Future<RoadmapResponse> roadmap() async =>
      RoadmapResponse.fromJson(await getJson('/api/roadmap'));

  Future<void> voteRoadmap(String id) async => postJson('/api/roadmap/$id/vote');

  Future<void> suggestRoadmap(String title, String description) async =>
      postJson('/api/roadmap/suggestions', body: {'title': title, 'description': description});
}
