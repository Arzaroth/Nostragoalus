import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:nostragoalus/api/token_store.dart';
import 'package:nostragoalus/chat/chat_providers.dart';
import 'package:nostragoalus/state/providers.dart';

import '../test/api/helpers.dart';

/// Phase 3 chat bootstrap, ON DEVICE against the live server: sign in, then the
/// chat identity generates an X25519 keypair (native libsodium), registers the
/// public key with `/api/chat/identity`, and persists the private key. Proves the
/// end-to-end identity path - crypto + secure storage + server round-trip.
///   flutter test integration_test/chat_identity_test.dart -d emulator-5554 \
///     --dart-define=API_BASE=http://10.0.2.2:3001 \
///     --dart-define=PROBE_EMAIL=probe@example.com \
///     --dart-define=PROBE_PASSWORD='Probe-Password123!'
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  const email = String.fromEnvironment('PROBE_EMAIL');
  const password = String.fromEnvironment('PROBE_PASSWORD');

  testWidgets('chat identity bootstraps + registers against the server', (tester) async {
    // A fresh keystore each run, so we exercise the generate-and-register path.
    final container = ProviderContainer(
      overrides: [tokenStoreProvider.overrideWithValue(TokenStore(InMemoryKv()))],
    );
    addTearDown(container.dispose);

    await container.read(authRepositoryProvider).signIn(email, password);

    final state = await container.read(chatIdentityProvider.future);
    expect(state.needsRecovery, isFalse);
    expect(state.identity, isNotNull);
    expect(state.identity!.publicKey, isNotEmpty);
    expect(state.identity!.privateKey.length, equals(32));
  });
}
