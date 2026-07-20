import 'api_client.dart';
import 'models.gen.dart';

/// Public share cards: minting a token for one of the caller's own cards, and
/// reading someone's card back by token for the in-app viewer.
extension ShareApi on ApiClient {
  /// Mint a share token for the caller's own analytics card. Returns the token
  /// used to build the public /a landing URL.
  Future<String> mintAnalyticsShare({String? competition}) async =>
      ShareMintResponse.fromJson(await postJson('/api/share/analytics-mint',
              body: competitionQuery(competition) ?? {}))
          .token;

  /// Wrapped shares are image-only (no landing page): returns the card image URL.
  Future<String> mintWrappedShare({String? competition}) async =>
      WrappedMintResponse.fromJson(
              await postJson('/api/share/wrapped-mint', body: competitionQuery(competition) ?? {}))
          .imageUrl;

  Future<String> mintProfileShare({String? competition}) async =>
      ProfileMintResponse.fromJson(await postJson('/api/share/profile-mint',
              body: competitionQuery(competition) ?? {}))
          .token;

  /// Read a shared card by token for the in-app viewer (analytics /a, profile /p,
  /// or pick /s). `kind` selects the endpoint; returns the `card` object.
  Future<Map<String, dynamic>> shareCard(String kind, String token) async {
    final path = switch (kind) {
      'a' => '/api/share/analytics/$token',
      'p' => '/api/share/profile/$token',
      _ => '/api/share/$token',
    };
    final res = await getJson(path);
    return (res['card'] as Map?)?.cast<String, dynamic>() ?? const {};
  }
}
