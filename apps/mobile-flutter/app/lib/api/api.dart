/// The whole API surface: [ApiClient] plus one `extension` per feature. A Dart
/// extension method is only callable where its library is in scope, so callers
/// import this barrel (or `state/providers.dart`, which re-exports it) rather
/// than picking slices one by one.
library;

export 'account_api.dart';
export 'api_client.dart';
export 'chat_api.dart';
export 'competitions_api.dart';
export 'dm_api.dart';
export 'leagues_api.dart';
export 'matches_api.dart';
export 'me_api.dart';
export 'predictions_api.dart';
export 'share_api.dart';
export 'sso_api.dart';
export 'voice_api.dart';
