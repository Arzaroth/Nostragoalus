import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:nostragoalus/api/token_store.dart';
import 'package:nostragoalus/chat/chat_providers.dart';
import 'package:nostragoalus/kt/kt_providers.dart';
import 'package:nostragoalus/state/providers.dart';

import '../test/api/helpers.dart';

/// KT verification on-device against the live server: sign in, bootstrap the
/// chat identity (so this user is in the key-transparency log), then re-walk the
/// server's hash chain and derive the safety number.
///   flutter test integration_test/kt_verify_test.dart -d emulator-5554 \
///     --dart-define=API_BASE=http://10.0.2.2:3001 \
///     --dart-define=PROBE_EMAIL=probe@example.com \
///     --dart-define=PROBE_PASSWORD='Probe-Password123!'
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  const email = String.fromEnvironment('PROBE_EMAIL');
  const password = String.fromEnvironment('PROBE_PASSWORD');

  testWidgets('the server key-transparency log verifies + yields a safety number',
      (tester) async {
    final container = ProviderContainer(
      overrides: [tokenStoreProvider.overrideWithValue(TokenStore(InMemoryKv()))],
    );
    addTearDown(container.dispose);

    await container.read(authRepositoryProvider).signIn(email, password);
    await container.read(chatIdentityProvider.future); // ensure identity is logged

    final kt = await container.read(ktProvider.future);
    expect(kt.verification.ok, isTrue, reason: 'KT chain should verify');
    expect(kt.mySafetyNumber, isNotNull);
    // Six groups of five digits.
    expect(kt.mySafetyNumber!.split(' '), hasLength(6));
  });
}
